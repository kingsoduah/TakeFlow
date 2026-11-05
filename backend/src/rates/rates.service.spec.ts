import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoqquError, RoqquService } from '../roqqu/roqqu.service.js';
import {
  convertWithSnapshot,
  parseCoinPrices,
  parseFiatRates,
  rateFromSnapshot,
  RatesService,
} from './rates.service.js';

// Shapes copied from the live feeds on 5 Nov 2026 (limit fields trimmed).
const RATES_FEED = {
  status: 'success',
  message: 'all rates retrieved successfully',
  data: [
    { symbol: 'ngn', title: 'Nigerian Naira', rate: 1375, icon: 'NGN', status: 1 },
    { symbol: 'usd', rate: 1, status: 1 },
    { symbol: 'gbp', rate: 0.75, status: 1 },
    { symbol: 'eur', rate: 0.92, status: 1 },
    { symbol: 'ghs', rate: 12.3, status: 0 },
    { symbol: 'kes', rate: 129, status: 1 },
  ],
};
const PRICES_FEED = {
  status: 'success',
  message: 'success',
  data: {
    usdt: { price: '1.000000000000000', change: 0 },
    usdc: { price: '0.999862311183132', change: -0.01 },
    btc: { price: '70000.1', change: 1 },
  },
};

describe('rates feed parsing', () => {
  it('keeps active price currencies and converts numbers via String', () => {
    const rates = parseFiatRates(RATES_FEED.data);
    expect(Object.keys(rates).sort()).toEqual(['EUR', 'GBP', 'NGN', 'USD']);
    expect(rates.GBP.toFixed()).toBe('0.75');
    expect(rates.NGN.toFixed()).toBe('1375');
  });

  it('keeps only accepted coins from /prices', () => {
    const prices = parseCoinPrices(PRICES_FEED.data);
    expect(Object.keys(prices).sort()).toEqual(['USDC', 'USDT']);
    expect(prices.USDC.toFixed()).toBe('0.999862311183132');
  });

  it('rejects malformed feeds', () => {
    expect(() => parseFiatRates({})).toThrow();
    expect(() => parseCoinPrices([])).toThrow();
  });

  it('derives rates and conversions from a snapshot', () => {
    const snapshot = {
      id: 'snap-1',
      fetchedAt: new Date(),
      fiatRates: parseFiatRates(RATES_FEED.data),
      coinPrices: parseCoinPrices(PRICES_FEED.data),
    };
    expect(rateFromSnapshot(snapshot, 'usdc', 'GBP')?.toFixed()).toBe('0.749896733387349');
    // GHS has status 0 in this fixture, so no rate is guessed.
    expect(rateFromSnapshot(snapshot, 'USDT', 'GHS')).toBeNull();
    expect(convertWithSnapshot(new Prisma.Decimal('450'), 'GBP', 'NGN', snapshot)?.toFixed()).toBe(
      '825000',
    );
    expect(convertWithSnapshot(new Prisma.Decimal('1'), 'GHS', 'NGN', snapshot)).toBeNull();
  });
});

describe('RatesService', () => {
  const prismaMock = {
    rateSnapshot: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  };
  const roqquMock = { getFiatRates: vi.fn(), getCryptoPrices: vi.fn() };
  let service: RatesService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.rateSnapshot.create.mockImplementation(async ({ data }: any) => ({
      id: 'snap-new',
      source: 'roqqu',
      ...data,
    }));
    prismaMock.rateSnapshot.findFirst.mockResolvedValue(null);
    roqquMock.getFiatRates.mockResolvedValue(RATES_FEED);
    roqquMock.getCryptoPrices.mockResolvedValue(PRICES_FEED);
    service = new RatesService(
      prismaMock as unknown as PrismaService,
      roqquMock as unknown as RoqquService,
    );
  });

  it('saves each fetch as a snapshot with decimal strings', async () => {
    const snapshot = await service.getFreshSnapshot();
    expect(snapshot?.id).toBe('snap-new');
    const saved = prismaMock.rateSnapshot.create.mock.calls[0][0].data;
    expect(saved.fiatRates).toEqual({ NGN: '1375', USD: '1', GBP: '0.75', EUR: '0.92' });
    expect(saved.coinPrices).toEqual({ USDT: '1', USDC: '0.999862311183132' });
  });

  it('reuses a fetch for 60 seconds', async () => {
    const now = new Date();
    await service.getFreshSnapshot(now);
    await service.getFreshSnapshot(new Date(now.getTime() + 30_000));
    expect(roqquMock.getFiatRates).toHaveBeenCalledTimes(1);
  });

  it('returns null when the feed fails and nothing recent is stored', async () => {
    roqquMock.getFiatRates.mockRejectedValue(new RoqquError('Roqqu request failed'));
    expect(await service.getFreshSnapshot()).toBeNull();
  });

  it('tries the feeds again once the 60 second cache is over', async () => {
    const now = new Date();
    await service.getFreshSnapshot(now);
    await service.getFreshSnapshot(new Date(now.getTime() + 61_000));
    expect(roqquMock.getFiatRates).toHaveBeenCalledTimes(2);
  });

  it('falls back to the last good snapshot for up to 30 minutes when the feeds fail', async () => {
    const now = new Date();
    await service.getFreshSnapshot(now);
    roqquMock.getFiatRates.mockRejectedValue(new RoqquError('Roqqu request failed: HTTP 502'));
    const later = await service.getFreshSnapshot(new Date(Date.now() + 25 * 60_000));
    expect(later?.id).toBe('snap-new');
    const tooLate = await service.getFreshSnapshot(new Date(Date.now() + 31 * 60_000));
    expect(tooLate).toBeNull();
  });

  it('uses a stored snapshot from the last 30 minutes after a restart', async () => {
    roqquMock.getFiatRates.mockRejectedValue(new RoqquError('down'));
    prismaMock.rateSnapshot.findFirst.mockResolvedValue({
      id: 'snap-stored',
      source: 'roqqu',
      fetchedAt: new Date(Date.now() - 10 * 60_000),
      fiatRates: { GBP: '0.75' },
      coinPrices: { USDT: '1' },
    });
    const snapshot = await service.getFreshSnapshot();
    expect(snapshot?.id).toBe('snap-stored');
    expect(snapshot?.fiatRates.GBP.toFixed()).toBe('0.75');
    const where = prismaMock.rateSnapshot.findFirst.mock.calls[0][0].where;
    expect(Date.now() - where.fetchedAt.gt.getTime()).toBeGreaterThanOrEqual(30 * 60_000 - 1000);
  });
});
