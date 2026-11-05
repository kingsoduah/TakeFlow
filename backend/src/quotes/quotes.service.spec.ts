import { Prisma, ValuationMethod } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService, RatesSnapshot } from '../rates/rates.service.js';
import {
  isQuoteActiveAt,
  PriceUnavailableError,
  quoteWindowMs,
  QuotesService,
} from './quotes.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const NOW = new Date('2026-11-05T15:00:00.000Z');
const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

function snapshot(overrides: Partial<RatesSnapshot> = {}): RatesSnapshot {
  return {
    id: 'snap-1',
    fetchedAt: NOW,
    fiatRates: { NGN: D('1375'), USD: D('1'), GBP: D('0.75'), EUR: D('0.92'), GHS: D('12.3') },
    coinPrices: { USDT: D('1'), USDC: D('0.999862311183132') },
    ...overrides,
  };
}

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-1',
    invoiceId: 'inv-1',
    sequence: 1,
    rateSnapshotId: 'snap-0',
    priceCurrency: 'GBP',
    amountDue: D('1000'),
    cryptoAsset: 'USDT',
    network: 'trc20',
    cryptoAmount: D('1333.34'),
    rate: D('0.75'),
    createdAt: NOW,
    expiresAt: at(300),
    endedAt: null,
    ...overrides,
  };
}

describe('QuotesService', () => {
  const prismaMock = {
    quote: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  };
  const ratesMock = { getFreshSnapshot: vi.fn() };
  let service: QuotesService;

  const invoice = (overrides = {}) => ({
    id: 'inv-1',
    currency: 'GBP',
    cryptoAsset: 'USDT',
    network: 'trc20',
    amountOutstanding: D('1000'),
    business: { quoteWindowMinutes: 5 },
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.quote.findFirst.mockResolvedValue(null);
    prismaMock.quote.create.mockImplementation(async ({ data }: any) => ({ id: 'quote-new', endedAt: null, ...data }));
    ratesMock.getFreshSnapshot.mockResolvedValue(snapshot());
    service = new QuotesService(
      prismaMock as unknown as PrismaService,
      ratesMock as unknown as RatesService,
    );
  });

  describe('quote creation and expiry', () => {
    it('fixes the amount owed, rate, rounded-up crypto amount, snapshot and window', async () => {
      const { quote, created } = await service.getOrCreate(invoice(), NOW);
      expect(created).toBe(true);
      const data = prismaMock.quote.create.mock.calls[0][0].data;
      expect(data.sequence).toBe(1);
      expect(data.rateSnapshotId).toBe('snap-1');
      expect(data.amountDue.toFixed()).toBe('1000');
      expect(data.rate.toFixed()).toBe('0.75');
      expect(data.cryptoAmount.toFixed()).toBe('1333.34');
      expect(data.createdAt).toEqual(NOW);
      expect(data.expiresAt).toEqual(at(300));
      expect(quote.id).toBe('quote-new');
    });

    it('uses the business window and keeps it within 2 to 5 minutes', async () => {
      await service.getOrCreate(invoice({ business: { quoteWindowMinutes: 2 } }), NOW);
      expect(prismaMock.quote.create.mock.calls[0][0].data.expiresAt).toEqual(at(120));
      expect(quoteWindowMs(10)).toBe(300_000);
      expect(quoteWindowMs(1)).toBe(120_000);
      expect(quoteWindowMs(undefined)).toBe(300_000);
    });

    it('quotes USDC with its own price (5.1 example)', async () => {
      await service.getOrCreate(invoice({ cryptoAsset: 'USDC', network: 'base' }), NOW);
      const data = prismaMock.quote.create.mock.calls[0][0].data;
      expect(data.rate.toFixed()).toBe('0.749896733387349');
      expect(data.cryptoAmount.toFixed()).toBe('1333.52');
    });

    it('returns the active quote while it still matches the amount owed', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(quoteRow());
      const { quote, created } = await service.getOrCreate(invoice(), at(60));
      expect(created).toBe(false);
      expect(quote.id).toBe('quote-1');
      expect(prismaMock.quote.create).not.toHaveBeenCalled();
      expect(ratesMock.getFreshSnapshot).not.toHaveBeenCalled();
    });

    it('makes a new quote once the old one has run out', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(quoteRow());
      const { created } = await service.getOrCreate(invoice(), at(300));
      expect(created).toBe(true);
      expect(prismaMock.quote.create.mock.calls[0][0].data.sequence).toBe(2);
      // The expired quote is not touched.
      expect(prismaMock.quote.updateMany).not.toHaveBeenCalled();
    });

    it('ends the running quote when the amount owed changed (part payment)', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(quoteRow());
      await service.getOrCreate(invoice({ amountOutstanding: D('550') }), at(90));
      const data = prismaMock.quote.create.mock.calls[0][0].data;
      expect(data.amountDue.toFixed()).toBe('550');
      expect(data.cryptoAmount.toFixed()).toBe('733.34');
      expect(prismaMock.quote.updateMany).toHaveBeenCalledWith({
        where: { id: 'quote-1', endedAt: null },
        data: { endedAt: at(90) },
      });
    });

    it('refuses to quote without a fresh rate', async () => {
      ratesMock.getFreshSnapshot.mockResolvedValue(null);
      await expect(service.getOrCreate(invoice(), NOW)).rejects.toBeInstanceOf(PriceUnavailableError);
      expect(prismaMock.quote.create).not.toHaveBeenCalled();
    });

    it('refuses to quote a currency missing from the feed', async () => {
      ratesMock.getFreshSnapshot.mockResolvedValue(
        snapshot({ fiatRates: { USD: D('1'), NGN: D('1375') } }),
      );
      await expect(service.getOrCreate(invoice(), NOW)).rejects.toBeInstanceOf(PriceUnavailableError);
    });

    it('uses the other request’s quote when two race for the same sequence', async () => {
      prismaMock.quote.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(quoteRow({ id: 'quote-winner', createdAt: new Date(), expiresAt: new Date(Date.now() + 300_000) }));
      prismaMock.quote.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      const { quote, created } = await service.getOrCreate(invoice());
      expect(created).toBe(false);
      expect(quote.id).toBe('quote-winner');
    });

    it('treats a quote as active from createdAt until expiry or early end', () => {
      const quote = quoteRow();
      expect(isQuoteActiveAt(quote, at(-1))).toBe(false);
      expect(isQuoteActiveAt(quote, NOW)).toBe(true);
      expect(isQuoteActiveAt(quote, at(299))).toBe(true);
      expect(isQuoteActiveAt(quote, at(300))).toBe(false);
      expect(isQuoteActiveAt(quoteRow({ endedAt: at(60) }), at(61))).toBe(false);
    });
  });

  describe('payment valuation inside and outside the window', () => {
    const payment = (overrides = {}) => ({
      invoiceId: 'inv-1',
      currency: 'GBP',
      cryptoAsset: 'USDT',
      network: 'trc20',
      amount: D('600'),
      depositedAt: at(120),
      now: at(400),
      ...overrides,
    });

    it('values a payment made inside the window at the quoted rate', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(quoteRow());
      const result = await service.valuePayment(payment());
      expect(prismaMock.quote.findFirst).toHaveBeenCalledWith({
        where: {
          invoiceId: 'inv-1',
          createdAt: { lte: at(120) },
          expiresAt: { gt: at(120) },
          OR: [{ endedAt: null }, { endedAt: { gt: at(120) } }],
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(result?.valuationMethod).toBe(ValuationMethod.QUOTE);
      expect(result?.valueAmount.toFixed()).toBe('450');
      expect(result?.quoteId).toBe('quote-1');
      expect(result?.rateSnapshotId).toBe('snap-0');
      // The quoted rate counts even though the live rate has moved.
      expect(ratesMock.getFreshSnapshot).not.toHaveBeenCalled();
    });

    it('values a payment outside any window at the latest rate on arrival', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(null);
      ratesMock.getFreshSnapshot.mockResolvedValue(
        snapshot({ id: 'snap-2', fiatRates: { GBP: D('0.8') } }),
      );
      const result = await service.valuePayment(payment());
      expect(result?.valuationMethod).toBe(ValuationMethod.ARRIVAL);
      expect(result?.valueAmount.toFixed()).toBe('480');
      expect(result?.quoteId).toBeNull();
      expect(result?.rateSnapshotId).toBe('snap-2');
      expect(result?.valuedAt).toEqual(at(400));
    });

    it('does not use a quote for a different coin or network', async () => {
      prismaMock.quote.findFirst.mockResolvedValue(quoteRow({ network: 'bep20' }));
      const result = await service.valuePayment(payment());
      expect(result?.valuationMethod).toBe(ValuationMethod.ARRIVAL);
    });

    it('values on arrival when no deposit time is known', async () => {
      const result = await service.valuePayment(payment({ depositedAt: undefined }));
      expect(prismaMock.quote.findFirst).not.toHaveBeenCalled();
      expect(result?.valuationMethod).toBe(ValuationMethod.ARRIVAL);
    });

    it('returns null instead of guessing when no fresh rate exists', async () => {
      ratesMock.getFreshSnapshot.mockResolvedValue(null);
      expect(await service.valuePayment(payment())).toBeNull();
    });
  });
});
