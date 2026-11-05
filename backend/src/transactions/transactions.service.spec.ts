import { NotFoundException } from '@nestjs/common';
import { Prisma, ReconciliationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RatesService, RatesSnapshot } from '../rates/rates.service.js';
import { TransactionsService } from './transactions.service.js';

const D = (v: string) => new Prisma.Decimal(v);

function snapshot(id: string, fiat: Record<string, string>): RatesSnapshot {
  return {
    id,
    fetchedAt: new Date('2026-11-05T14:28:00Z'),
    fiatRates: Object.fromEntries(Object.entries(fiat).map(([k, v]) => [k, D(v)])),
    coinPrices: { USDT: D('1') },
  };
}

describe('TransactionsService', () => {
  const prismaMock = {
    transaction: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      groupBy: vi.fn(),
    },
    invoice: {
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      updateMany: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  const ratesMock = { getFreshSnapshot: vi.fn(), getSnapshotsByIds: vi.fn() };
  let service: TransactionsService;

  // Currency buckets for the summary, as invoice.groupBy returns them.
  let buckets: any[] = [];
  let receivedGroups: any[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    buckets = [];
    receivedGroups = [];
    prismaMock.invoice.groupBy.mockImplementation(async (args: any) =>
      args.by.includes('currency') ? buckets : [{ status: 'PAID', _count: { status: 1 } }],
    );
    prismaMock.transaction.groupBy.mockImplementation(async () => receivedGroups);
    prismaMock.transaction.count.mockImplementation(async (args: any) =>
      args.where.reconciliationStatus === ReconciliationStatus.UNMATCHED ? 2 : 0,
    );
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.user.findUnique.mockResolvedValue({ displayCurrency: 'GBP' });
    ratesMock.getSnapshotsByIds.mockResolvedValue(new Map());
    service = new TransactionsService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
      ratesMock as unknown as RatesService,
    );
  });

  const bucket = (currency: string, amount: string, received: string, outstanding: string) => ({
    currency,
    _sum: {
      amount: D(amount),
      amountReceived: D(received),
      amountOutstanding: D(outstanding),
      amountOverpaid: D('0'),
    },
    _count: { _all: 1 },
  });

  it('lists transactions scoped to the owned business', async () => {
    prismaMock.transaction.findMany.mockResolvedValue([]);
    prismaMock.transaction.count.mockResolvedValue(0);
    const result = await service.findAll('owner-1', 'biz-1', {});
    expect(result).toEqual({ data: [], total: 0, limit: 50, offset: 0 });
    expect(prismaMock.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz-1' } }),
    );
  });

  it('returns 404 for foreign transaction ids', async () => {
    prismaMock.transaction.findFirst.mockResolvedValue(null);
    const error = await service.findOne('owner-1', 'biz-1', 'tx-x').catch((e) => e);
    expect(error).toBeInstanceOf(NotFoundException);
  });

  it('summarizes with zeroed defaults and no rate lookups when nothing needs converting', async () => {
    buckets = [bucket('GBP', '3000', '0', '3000')];
    const summary = await service.businessSummary('owner-1', 'biz-1');
    expect(summary.displayCurrency).toBe('GBP');
    expect(summary.totalInvoiced).toBe('3000');
    expect(summary.totalReceived).toBe('0');
    expect(summary.unmatchedTransactionCount).toBe(2);
    expect(summary.invoiceCountByStatus.PAID).toBe(1);
    expect(summary.invoiceCountByStatus.DRAFT).toBe(0);
    expect(summary.ratesAsOf).toBeNull();
    expect(ratesMock.getFreshSnapshot).not.toHaveBeenCalled();
  });

  it('never adds currencies together: per-currency totals plus converted totals', async () => {
    buckets = [bucket('GBP', '1000', '450', '550'), bucket('NGN', '1375000', '0', '1375000')];
    receivedGroups = [{ valueCurrency: 'GBP', rateSnapshotId: 'snap-paid', _sum: { valueAmount: D('450') } }];
    ratesMock.getFreshSnapshot.mockResolvedValue(
      snapshot('snap-today', { GBP: '0.75', NGN: '1375', USD: '1' }),
    );

    const summary = await service.businessSummary('owner-1', 'biz-1', { currency: 'NGN' });
    expect(summary.displayCurrency).toBe('NGN');
    expect(summary.byCurrency).toEqual([
      expect.objectContaining({ currency: 'GBP', totalInvoiced: '1000', totalOutstanding: '550' }),
      expect.objectContaining({ currency: 'NGN', totalInvoiced: '1375000' }),
    ]);
    // GBP 1,000 at today's rate is NGN 1,833,333.33; plus NGN 1,375,000.
    expect(summary.totalInvoiced).toBe('3208333.33');
    expect(summary.totalOutstanding).toBe('2383333.33');
    expect(summary.ratesAsOf).toEqual(new Date('2026-11-05T14:28:00Z'));
  });

  it('converts money received at the snapshot each payment was valued with', async () => {
    buckets = [bucket('GBP', '1000', '450', '550')];
    receivedGroups = [{ valueCurrency: 'GBP', rateSnapshotId: 'snap-paid', _sum: { valueAmount: D('450') } }];
    ratesMock.getFreshSnapshot.mockResolvedValue(snapshot('snap-today', { GBP: '0.8', USD: '1' }));
    ratesMock.getSnapshotsByIds.mockResolvedValue(
      new Map([['snap-paid', snapshot('snap-paid', { GBP: '0.75', USD: '1' })]]),
    );

    const summary = await service.businessSummary('owner-1', 'biz-1', { currency: 'USD' });
    expect(ratesMock.getSnapshotsByIds).toHaveBeenCalledWith(['snap-paid']);
    // Received: GBP 450 at the payment-time 0.75 = USD 600.
    expect(summary.totalReceived).toBe('600');
    // Invoiced: GBP 1,000 at today's 0.8 = USD 1,250.
    expect(summary.totalInvoiced).toBe('1250');
  });

  it('returns null totals instead of guessing when a needed rate is missing', async () => {
    buckets = [bucket('GBP', '1000', '0', '1000')];
    ratesMock.getFreshSnapshot.mockResolvedValue(null);
    const summary = await service.businessSummary('owner-1', 'biz-1', { currency: 'NGN' });
    expect(summary.totalInvoiced).toBeNull();
    expect(summary.totalOutstanding).toBeNull();
    expect(summary.byCurrency[0].totalInvoiced).toBe('1000');
  });

  it('defaults the display currency to the first invoice, else USD', async () => {
    prismaMock.user.findUnique.mockResolvedValue({ displayCurrency: null });
    prismaMock.invoice.findFirst.mockResolvedValue({ currency: 'NGN' });
    expect((await service.businessSummary('owner-1', 'biz-1')).displayCurrency).toBe('NGN');
    prismaMock.invoice.findFirst.mockResolvedValue(null);
    expect((await service.businessSummary('owner-1', 'biz-1')).displayCurrency).toBe('USD');
  });

  it('leaves drafts and expired links out of the totals and expires stale checkouts first', async () => {
    await service.businessSummary('owner-1', 'biz-1', { kind: 'CHECKOUT' });
    expect(prismaMock.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: 'biz-1', kind: 'CHECKOUT', status: 'PENDING' }),
        data: { status: 'EXPIRED' },
      }),
    );
    const bucketWhere = prismaMock.invoice.groupBy.mock.calls.find((call: any) =>
      call[0].by.includes('currency'),
    )![0].where;
    expect(bucketWhere).toEqual({
      businessId: 'biz-1',
      kind: 'CHECKOUT',
      status: { notIn: ['DRAFT', 'EXPIRED'] },
    });
  });
});
