import {
  BadGatewayException,
  ConflictException,
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InvoiceKind, InvoiceStatus, Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutsService } from '../checkouts/checkouts.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PriceUnavailableError, QuotesService } from '../quotes/quotes.service.js';
import { RatesService } from '../rates/rates.service.js';
import { RoqquError } from '../roqqu/roqqu.service.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { PublicPaymentsService } from './public-payments.service.js';

const D = (v: string) => new Prisma.Decimal(v);
const REF = 'pay_0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-11-05T15:00:00.000Z');

function invoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-secret-id',
    businessId: 'biz-secret-id',
    kind: InvoiceKind.INVOICE,
    clientId: 'client-secret-id',
    invoiceNumber: 'INV-20261105-1A2B',
    description: 'Landing page design',
    amount: D('1000'),
    currency: 'GBP',
    cryptoAsset: 'USDT',
    network: 'trc20',
    issueDate: NOW,
    dueDate: new Date('2026-12-31T00:00:00Z'),
    paymentAddress: 'TAddress123',
    paymentReference: REF,
    status: InvoiceStatus.PENDING,
    amountReceived: D('0'),
    amountOutstanding: D('1000'),
    amountOverpaid: D('0'),
    shortfallToleranceBps: 50,
    externalOrderId: 'order-secret',
    buyerName: 'Private Buyer',
    buyerEmail: 'private.buyer@example.com',
    returnUrl: null,
    expiresAt: null,
    productLinkId: 'link-secret-id',
    createdAt: NOW,
    updatedAt: NOW,
    business: { businessName: 'Acme Studios', quoteWindowMinutes: 5 },
    ...overrides,
  };
}

function quoteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'quote-secret-id',
    invoiceId: 'inv-secret-id',
    sequence: 1,
    rateSnapshotId: 'snap-secret-id',
    priceCurrency: 'GBP',
    amountDue: D('1000'),
    cryptoAsset: 'USDT',
    network: 'trc20',
    cryptoAmount: D('1333.34'),
    rate: D('0.75'),
    createdAt: NOW,
    expiresAt: new Date(NOW.getTime() + 300_000),
    endedAt: null,
    rateSnapshot: { fetchedAt: new Date('2026-11-05T14:58:00.000Z') },
    ...overrides,
  };
}

describe('PublicPaymentsService', () => {
  const prismaMock = {
    invoice: { findUnique: vi.fn(), updateMany: vi.fn() },
    transaction: { findMany: vi.fn() },
    productLink: { findUnique: vi.fn() },
  };
  const checkoutsMock = { create: vi.fn() };
  const quotesMock = { findActive: vi.fn(), getOrCreate: vi.fn() };
  const ratesMock = { getFreshSnapshot: vi.fn() };
  const walletsMock = { ensureAddress: vi.fn() };
  let service: PublicPaymentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow());
    prismaMock.transaction.findMany.mockResolvedValue([]);
    quotesMock.findActive.mockResolvedValue(null);
    quotesMock.getOrCreate.mockResolvedValue({ quote: quoteRow(), created: true });
    service = new PublicPaymentsService(
      prismaMock as unknown as PrismaService,
      quotesMock as unknown as QuotesService,
      ratesMock as unknown as RatesService,
      walletsMock as unknown as WalletsService,
      checkoutsMock as unknown as CheckoutsService,
    );
  });

  describe('not leaking data', () => {
    it('rejects malformed references without touching the database', async () => {
      for (const bad of ['pay_123', 'inv-secret-id', `${REF}x`, 'PAY_0123456789ABCDEF0123456789ABCDEF']) {
        await expect(service.getPayment(bad, undefined, NOW)).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(prismaMock.invoice.findUnique).not.toHaveBeenCalled();
    });

    it('looks up only the given reference and reads payments of that invoice only', async () => {
      await service.getPayment(REF, undefined, NOW);
      expect(prismaMock.invoice.findUnique).toHaveBeenCalledWith({
        where: { paymentReference: REF },
        include: { business: { select: { businessName: true, quoteWindowMinutes: true } } },
      });
      expect(prismaMock.transaction.findMany.mock.calls[0][0].where).toEqual({
        invoiceId: 'inv-secret-id',
        reconciliationStatus: 'MATCHED',
      });
    });

    it('returns no internal ids, contact details or order ids', async () => {
      quotesMock.findActive.mockResolvedValue(quoteRow());
      prismaMock.transaction.findMany.mockResolvedValue([
        {
          transactionHash: '0xhash',
          asset: 'USDT',
          network: 'trc20',
          amount: D('100'),
          valueAmount: D('75'),
          valueCurrency: 'GBP',
          valuationMethod: 'QUOTE',
          depositedAt: NOW,
          createdAt: NOW,
        },
      ]);
      const view = await service.getPayment(REF, undefined, NOW);
      const text = JSON.stringify(view);
      for (const secret of [
        'inv-secret-id',
        'biz-secret-id',
        'client-secret-id',
        'quote-secret-id',
        'snap-secret-id',
        'link-secret-id',
        'order-secret',
        'Private Buyer',
        'private.buyer@example.com',
      ]) {
        expect(text).not.toContain(secret);
      }
      expect(view).not.toHaveProperty('id');
      expect(view).not.toHaveProperty('businessId');
      expect(view.businessName).toBe('Acme Studios');
      expect(view.payments[0]).toEqual(
        expect.objectContaining({ transactionHash: '0xhash', valueAmount: '75' }),
      );
    });

    it('hides drafts', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow({ status: InvoiceStatus.DRAFT }));
      await expect(service.getPayment(REF, undefined, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('payment page view', () => {
    it('shows the active quote with its rate time and countdown', async () => {
      quotesMock.findActive.mockResolvedValue(quoteRow());
      const view = await service.getPayment(REF, undefined, NOW);
      expect(view.payable).toBe(true);
      expect(view.quote).toEqual({
        cryptoAmount: '1333.34',
        cryptoAsset: 'USDT',
        network: 'trc20',
        priceCurrency: 'GBP',
        amountDue: '1000',
        rate: '0.75',
        rateFetchedAt: new Date('2026-11-05T14:58:00.000Z'),
        createdAt: NOW,
        expiresAt: new Date(NOW.getTime() + 300_000),
      });
      expect(view.serverTime).toEqual(NOW);
      // A plain read never creates quotes or addresses.
      expect(quotesMock.getOrCreate).not.toHaveBeenCalled();
      expect(walletsMock.ensureAddress).not.toHaveBeenCalled();
    });

    it('hides a quote made before a part payment changed the amount owed', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(
        invoiceRow({
          status: InvoiceStatus.PARTIALLY_PAID,
          amountReceived: D('450'),
          amountOutstanding: D('550'),
        }),
      );
      quotesMock.findActive.mockResolvedValue(quoteRow());
      const view = await service.getPayment(REF, undefined, NOW);
      expect(view.quote).toBeNull();
      expect(view.payable).toBe(true);
    });

    it('converts amounts for display when the payer picks a currency', async () => {
      ratesMock.getFreshSnapshot.mockResolvedValue({
        id: 'snap-x',
        fetchedAt: new Date('2026-11-05T14:59:00Z'),
        fiatRates: { GBP: D('0.75'), NGN: D('1375') },
        coinPrices: {},
      });
      const view = await service.getPayment(REF, 'NGN', NOW);
      expect(view.display).toEqual({
        currency: 'NGN',
        amount: '1833333.33',
        amountReceived: '0',
        amountOutstanding: '1833333.33',
        rateFetchedAt: new Date('2026-11-05T14:59:00Z'),
      });
      // What is owed stays in the price currency.
      expect(view.amountOutstanding).toBe('1000');
      expect(view.currency).toBe('GBP');
    });

    it('expires an unpaid checkout past its expiry when read', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(
        invoiceRow({ kind: InvoiceKind.CHECKOUT, expiresAt: new Date(NOW.getTime() - 1000) }),
      );
      const view = await service.getPayment(REF, undefined, NOW);
      expect(view.status).toBe(InvoiceStatus.EXPIRED);
      expect(view.payable).toBe(false);
      expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'inv-secret-id', status: InvoiceStatus.PENDING },
        data: { status: InvoiceStatus.EXPIRED },
      });
    });
  });

  describe('fresh quote requests', () => {
    it('makes or reuses a quote and creates the address on first use', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow({ paymentAddress: null }));
      walletsMock.ensureAddress.mockResolvedValue({ address: 'TNew', network: 'trc20', reused: false });
      quotesMock.findActive.mockResolvedValue(quoteRow());
      const view = await service.requestQuote(REF, undefined, NOW);
      expect(quotesMock.getOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'inv-secret-id', amountOutstanding: D('1000') }),
        NOW,
      );
      expect(walletsMock.ensureAddress).toHaveBeenCalledWith('inv-secret-id');
      expect(view.address).toBe('TNew');
      expect(view.quote?.cryptoAmount).toBe('1333.34');
    });

    it('says the price is unavailable (503) and makes no address', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow({ paymentAddress: null }));
      quotesMock.getOrCreate.mockRejectedValue(new PriceUnavailableError());
      await expect(service.requestQuote(REF, undefined, NOW)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(walletsMock.ensureAddress).not.toHaveBeenCalled();
    });

    it('maps a Roqqu address failure to 502', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(invoiceRow({ paymentAddress: null }));
      walletsMock.ensureAddress.mockRejectedValue(new RoqquError('Roqqu request failed'));
      await expect(service.requestQuote(REF, undefined, NOW)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    });

    it('refuses paid invoices (409) and expired checkouts (410)', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(
        invoiceRow({ status: InvoiceStatus.PAID, amountOutstanding: D('0') }),
      );
      await expect(service.requestQuote(REF, undefined, NOW)).rejects.toBeInstanceOf(
        ConflictException,
      );
      prismaMock.invoice.findUnique.mockResolvedValue(
        invoiceRow({ kind: InvoiceKind.CHECKOUT, expiresAt: new Date(NOW.getTime() - 1) }),
      );
      await expect(service.requestQuote(REF, undefined, NOW)).rejects.toBeInstanceOf(GoneException);
      expect(quotesMock.getOrCreate).not.toHaveBeenCalled();
    });

    it('lets a part-paid checkout get a quote for the rest after its expiry', async () => {
      prismaMock.invoice.findUnique.mockResolvedValue(
        invoiceRow({
          kind: InvoiceKind.CHECKOUT,
          status: InvoiceStatus.PARTIALLY_PAID,
          amountReceived: D('450'),
          amountOutstanding: D('550'),
          expiresAt: new Date(NOW.getTime() - 1000),
        }),
      );
      await service.requestQuote(REF, undefined, NOW);
      expect(quotesMock.getOrCreate).toHaveBeenCalled();
    });
  });

  describe('product link session start', () => {
    const LINK = 'link_0123456789abcdef0123456789abcdef';
    const linkRow = (overrides: Record<string, unknown> = {}) => ({
      id: 'link-secret-id',
      businessId: 'biz-secret-id',
      reference: LINK,
      title: 'Ankara tote bag',
      description: null,
      amount: D('5000'),
      currency: 'NGN',
      cryptoAsset: 'USDT',
      network: 'trc20',
      returnUrl: 'https://shop.example/thanks',
      active: true,
      business: { businessName: 'Acme Store', quoteWindowMinutes: 3 },
      ...overrides,
    });
    const goodSnapshot = {
      id: 'snap-1',
      fetchedAt: new Date('2026-11-05T14:59:00Z'),
      fiatRates: { NGN: D('1375') },
      coinPrices: { USDT: D('1') },
    };

    beforeEach(() => {
      prismaMock.productLink.findUnique.mockResolvedValue(linkRow());
      ratesMock.getFreshSnapshot.mockResolvedValue(goodSnapshot);
      checkoutsMock.create.mockResolvedValue({
        checkout: invoiceRow({
          id: 'chk-new',
          kind: InvoiceKind.CHECKOUT,
          amount: D('5000'),
          currency: 'NGN',
          amountOutstanding: D('5000'),
          paymentAddress: null,
          paymentReference: 'pay_ffffffffffffffffffffffffffffffff',
          expiresAt: new Date(NOW.getTime() + 86_400_000),
          returnUrl: 'https://shop.example/thanks',
        }),
        created: true,
      });
      walletsMock.ensureAddress.mockResolvedValue({ address: 'TBuyer1', network: 'trc20', reused: false });
    });

    it('shows the product with an indicative amount and makes nothing', async () => {
      const view = await service.getProductLink(LINK, NOW);
      expect(view).toEqual(
        expect.objectContaining({
          businessName: 'Acme Store',
          title: 'Ankara tote bag',
          amount: '5000',
          active: true,
          indicative: {
            cryptoAmount: '3.64',
            rate: '1375',
            rateFetchedAt: new Date('2026-11-05T14:59:00Z'),
          },
        }),
      );
      expect(JSON.stringify(view)).not.toContain('secret');
      expect(checkoutsMock.create).not.toHaveBeenCalled();
      expect(walletsMock.ensureAddress).not.toHaveBeenCalled();
    });

    it('starts the buyer their own checkout with address and quote when they tap Pay', async () => {
      quotesMock.findActive.mockResolvedValue(
        quoteRow({ priceCurrency: 'NGN', amountDue: D('5000'), cryptoAmount: D('3.64'), rate: D('1375') }),
      );
      const view = await service.startProductLinkCheckout(
        LINK,
        { buyerName: 'Chidi Okafor', buyerEmail: 'chidi@example.com' },
        undefined,
        NOW,
      );
      expect(checkoutsMock.create).toHaveBeenCalledWith(
        'biz-secret-id',
        {
          amount: '5000',
          currency: 'NGN',
          cryptoAsset: 'USDT',
          network: 'trc20',
          description: 'Ankara tote bag',
          buyerName: 'Chidi Okafor',
          buyerEmail: 'chidi@example.com',
          returnUrl: 'https://shop.example/thanks',
          productLinkId: 'link-secret-id',
        },
        NOW,
      );
      expect(quotesMock.getOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'chk-new', business: { businessName: 'Acme Store', quoteWindowMinutes: 3 } }),
        NOW,
      );
      expect(walletsMock.ensureAddress).toHaveBeenCalledWith('chk-new');
      expect(view.paymentReference).toBe('pay_ffffffffffffffffffffffffffffffff');
      expect(view.address).toBe('TBuyer1');
      expect(view.kind).toBe(InvoiceKind.CHECKOUT);
      expect(view.returnUrl).toBe('https://shop.example/thanks');
      expect(view.quote?.cryptoAmount).toBe('3.64');
    });

    it('lets the buyer skip name and email', async () => {
      await service.startProductLinkCheckout(LINK, {}, undefined, NOW);
      expect(checkoutsMock.create.mock.calls[0][1]).toEqual(
        expect.objectContaining({ buyerName: undefined, buyerEmail: undefined }),
      );
    });

    it('makes nothing when the price is unavailable (503)', async () => {
      ratesMock.getFreshSnapshot.mockResolvedValue(null);
      await expect(service.startProductLinkCheckout(LINK, {}, undefined, NOW)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(checkoutsMock.create).not.toHaveBeenCalled();
      expect(walletsMock.ensureAddress).not.toHaveBeenCalled();
    });

    it('refuses a link the shop turned off (410)', async () => {
      prismaMock.productLink.findUnique.mockResolvedValue(linkRow({ active: false }));
      await expect(service.startProductLinkCheckout(LINK, {}, undefined, NOW)).rejects.toBeInstanceOf(
        GoneException,
      );
      expect(checkoutsMock.create).not.toHaveBeenCalled();
    });

    it('closes the new checkout when Roqqu cannot make the address (502)', async () => {
      walletsMock.ensureAddress.mockRejectedValue(new RoqquError('Roqqu request failed'));
      await expect(service.startProductLinkCheckout(LINK, {}, undefined, NOW)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
      expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith({
        where: { id: 'chk-new', status: InvoiceStatus.PENDING },
        data: { status: InvoiceStatus.EXPIRED },
      });
    });

    it('404s unknown or malformed link references', async () => {
      await expect(service.getProductLink('link_nope', NOW)).rejects.toBeInstanceOf(NotFoundException);
      prismaMock.productLink.findUnique.mockResolvedValue(null);
      await expect(service.getProductLink(LINK, NOW)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
