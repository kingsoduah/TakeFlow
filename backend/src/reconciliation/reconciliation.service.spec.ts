import { InvoiceStatus, Prisma, ReconciliationStatus, ValuationMethod } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { QuotesService } from '../quotes/quotes.service.js';
import { ReconciliationService } from './reconciliation.service.js';

const D = (v: string | number) => new Prisma.Decimal(String(v));

describe('ReconciliationService', () => {
  const prismaMock = {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
    },
    wallet: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  const quotesMock = { valuePayment: vi.fn() };
  let service: ReconciliationService;

  const deposit = (overrides = {}) => ({
    transactionHash: '0xhash1',
    receivingAddress: '0xrecv',
    asset: 'USDT',
    network: 'trc20',
    amount: D('1500.00'),
    depositedAt: new Date('2026-11-05T15:00:00Z'),
    ...overrides,
  });

  // Valuation at a 1:1 rate unless a test says otherwise.
  const valuation = (value: string, overrides = {}) => ({
    valuationMethod: ValuationMethod.ARRIVAL,
    valueCurrency: 'USD',
    valueAmount: D(value),
    valuationRate: D('1'),
    rateSnapshotId: 'snap-1',
    quoteId: null,
    valuedAt: new Date('2026-11-05T15:00:05Z'),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.transaction.findUnique.mockResolvedValue(null);
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { valueAmount: D('0') } });
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));
    service = new ReconciliationService(
      prismaMock as unknown as PrismaService,
      quotesMock as unknown as QuotesService,
    );
  });

  function ownedInvoice(outstanding: string, amount = '1500.00', currency = 'USD') {
    return {
      id: 'inv-1',
      businessId: 'biz-1',
      amount: D(amount),
      currency,
      amountReceived: D('0'),
      amountOutstanding: D(outstanding),
      shortfallToleranceBps: 50,
      status: InvoiceStatus.PENDING,
      cryptoAsset: 'USDT',
      network: 'trc20',
    };
  }

  function mockInvoiceRow(row: ReturnType<typeof ownedInvoice>) {
    prismaMock.wallet.findUnique.mockResolvedValue({ businessId: 'biz-1' });
    prismaMock.invoice.findFirst.mockResolvedValue(row);
    prismaMock.invoice.findUnique.mockResolvedValue(row);
  }

  // aggregate() is read before the insert (the prior total) and again in
  // recomputeInvoice (the new total).
  function mockSums(before: string, after: string) {
    prismaMock.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { valueAmount: D(before) } })
      .mockResolvedValue({ _sum: { valueAmount: D(after) } });
  }

  it('records unmatched when no wallet owns the address', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue(null);

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('unmatched');
    expect(result.invoiceId).toBeNull();
    expect(prismaMock.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          businessId: null,
          reconciliationStatus: ReconciliationStatus.UNMATCHED,
        }),
      }),
    );
    expect(quotesMock.valuePayment).not.toHaveBeenCalled();
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('records unmatched on asset mismatch without touching the invoice', async () => {
    mockInvoiceRow(ownedInvoice('1500.00'));

    const result = await service.reconcileVerifiedDeposit(deposit({ asset: 'BTC' }));
    expect(result.status).toBe('unmatched');
    expect(quotesMock.valuePayment).not.toHaveBeenCalled();
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('values the payment once, stores the valuation and marks an exact payment PAID', async () => {
    mockInvoiceRow(ownedInvoice('1500.00'));
    quotesMock.valuePayment.mockResolvedValue(valuation('1500'));
    mockSums('0', '1500');

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('matched');
    expect(quotesMock.valuePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 'inv-1',
        currency: 'USD',
        depositedAt: new Date('2026-11-05T15:00:00Z'),
      }),
    );
    const created = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(created.valueAmount.equals(D('1500'))).toBe(true);
    expect(created.valueCurrency).toBe('USD');
    expect(created.valuationMethod).toBe(ValuationMethod.ARRIVAL);
    expect(created.rateSnapshotId).toBe('snap-1');
    expect(created.reconciliationStatus).toBe(ReconciliationStatus.MATCHED);

    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PAID);
    expect(updateData.amountOutstanding.equals(D('0'))).toBe(true);
    expect(updateData.amountReceived.equals(D('1500'))).toBe(true);
  });

  it('marks smaller payments PARTIALLY_PAID', async () => {
    mockInvoiceRow(ownedInvoice('2000.00', '2000.00'));
    quotesMock.valuePayment.mockResolvedValue(valuation('500'));
    mockSums('0', '500');

    await service.reconcileVerifiedDeposit(deposit({ amount: D('500.00') }));
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(updateData.amountOutstanding.equals(D('1500'))).toBe(true);
  });

  it('takes each payment off a fiat balance at its stored value (GBP example, 5.4)', async () => {
    mockInvoiceRow(ownedInvoice('1000', '1000', 'GBP'));
    quotesMock.valuePayment.mockResolvedValue(
      valuation('450', {
        valuationMethod: ValuationMethod.QUOTE,
        valueCurrency: 'GBP',
        valuationRate: D('0.75'),
        quoteId: 'quote-1',
      }),
    );
    mockSums('0', '450');

    await service.reconcileVerifiedDeposit(deposit({ amount: D('600') }));
    const created = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(created.amount.equals(D('600'))).toBe(true);
    expect(created.valueAmount.equals(D('450'))).toBe(true);
    expect(created.quoteId).toBe('quote-1');
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(updateData.amountOutstanding.equals(D('550'))).toBe(true);
  });

  it('marks overpayments PAID and records the excess in the price currency', async () => {
    mockInvoiceRow(ownedInvoice('1500.00'));
    quotesMock.valuePayment.mockResolvedValue(valuation('1600'));
    mockSums('0', '1600');

    await service.reconcileVerifiedDeposit(deposit({ amount: D('1600.00') }));
    const created = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(created.excessAmount.equals(D('100'))).toBe(true);
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PAID);
    expect(updateData.amountOverpaid.equals(D('100'))).toBe(true);
  });

  it('counts a shortfall under the tolerance as paid', async () => {
    mockInvoiceRow(ownedInvoice('1000', '1000', 'GBP'));
    quotesMock.valuePayment.mockResolvedValue(valuation('997', { valueCurrency: 'GBP' }));
    mockSums('0', '997');

    await service.reconcileVerifiedDeposit(deposit({ amount: D('1329.34') }));
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PAID);
    expect(updateData.amountOutstanding.equals(D('0'))).toBe(true);
  });

  it('stores a matched payment unvalued when no rate is available', async () => {
    mockInvoiceRow(ownedInvoice('1500.00'));
    quotesMock.valuePayment.mockResolvedValue(null);

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('matched');
    const created = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(created.reconciliationStatus).toBe(ReconciliationStatus.MATCHED);
    expect(created.valueAmount).toBeUndefined();
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PENDING);
    expect(updateData.amountReceived.equals(D('0'))).toBe(true);
  });

  it('treats a repeated transaction hash as duplicate without revaluing it', async () => {
    prismaMock.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      invoiceId: 'inv-1',
      reconciliationStatus: ReconciliationStatus.MATCHED,
      valueAmount: D('1500'),
    });
    prismaMock.invoice.findUnique.mockResolvedValue(ownedInvoice('0'));
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { valueAmount: D('1500') } });

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('duplicate');
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
    expect(quotesMock.valuePayment).not.toHaveBeenCalled();
    expect(prismaMock.transaction.updateMany).not.toHaveBeenCalled();
  });

  it('values a previously unvalued payment once on redelivery', async () => {
    prismaMock.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      invoiceId: 'inv-1',
      asset: 'USDT',
      network: 'trc20',
      amount: D('1500'),
      depositedAt: new Date('2026-11-05T15:00:00Z'),
      reconciliationStatus: ReconciliationStatus.MATCHED,
      valueAmount: null,
    });
    prismaMock.invoice.findUnique.mockResolvedValue(ownedInvoice('1500.00'));
    quotesMock.valuePayment.mockResolvedValue(valuation('1500'));
    mockSums('0', '1500');

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('duplicate');
    expect(prismaMock.transaction.updateMany).toHaveBeenCalledWith({
      where: { id: 'tx-1', valueAmount: null },
      data: expect.objectContaining({ valueCurrency: 'USD' }),
    });
    expect(prismaMock.invoice.update.mock.calls[0][0].data.status).toBe(InvoiceStatus.PAID);
  });
});
