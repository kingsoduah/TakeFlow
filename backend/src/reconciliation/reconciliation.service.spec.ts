import { InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReconciliationService } from './reconciliation.service.js';

const D = (v: string | number) => new Prisma.Decimal(String(v));

describe('ReconciliationService', () => {
  const prismaMock = {
    transaction: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
    },
    wallet: { findUnique: vi.fn() },
    invoice: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  let service: ReconciliationService;

  const deposit = (overrides = {}) => ({
    transactionHash: '0xhash1',
    receivingAddress: '0xrecv',
    asset: 'USDT',
    network: 'erc20',
    amount: D('1500.00'),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.transaction.findUnique.mockResolvedValue(null);
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: D('0') } });
    service = new ReconciliationService(prismaMock as unknown as PrismaService);
  });

  function ownedInvoice(outstanding: string, amount = '1500.00') {
    return {
      id: 'inv-1',
      businessId: 'biz-1',
      amount: D(amount),
      amountReceived: D('0'),
      amountOutstanding: D(outstanding),
      status: InvoiceStatus.PENDING,
      cryptoAsset: 'USDT',
      network: 'erc20',
    };
  }

  function mockInvoiceRow(row: ReturnType<typeof ownedInvoice>) {
    prismaMock.invoice.findFirst.mockResolvedValue(row);
    prismaMock.invoice.findUnique.mockResolvedValue(row);
  }

  it('records unmatched when no wallet owns the address', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue(null);
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));

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
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('records unmatched on asset mismatch without touching the invoice', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue({ businessId: 'biz-1' });
    mockInvoiceRow(ownedInvoice('1500.00'));
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));

    const result = await service.reconcileVerifiedDeposit(deposit({ asset: 'BTC' }));
    expect(result.status).toBe('unmatched');
    expect(prismaMock.invoice.update).not.toHaveBeenCalled();
  });

  it('marks exact payment PAID with zero outstanding', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue({ businessId: 'biz-1' });
    mockInvoiceRow(ownedInvoice('1500.00'));
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));
    // aggregate() runs after the insert: the newly matched sum is the deposit.
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: D('1500.00') } });

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('matched');
    expect(prismaMock.invoice.update).toHaveBeenCalledWith({
      where: { id: 'inv-1' },
      data: expect.objectContaining({ status: InvoiceStatus.PAID }),
    });
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.amountOutstanding.equals(D('0'))).toBe(true);
    expect(updateData.amountReceived.equals(D('1500.00'))).toBe(true);
  });

  it('marks smaller payments PARTIALLY_PAID', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue({ businessId: 'biz-1' });
    mockInvoiceRow(ownedInvoice('2000.00', '2000.00'));
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));
    prismaMock.transaction.aggregate.mockResolvedValue({ _sum: { amount: D('500.00') } });

    await service.reconcileVerifiedDeposit(deposit({ amount: D('500.00') }));
    const updateData = prismaMock.invoice.update.mock.calls[0][0].data;
    expect(updateData.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    expect(updateData.amountOutstanding.equals(D('1500.00'))).toBe(true);
  });

  it('marks overpayments PAID and records the excess on the transaction', async () => {
    prismaMock.wallet.findUnique.mockResolvedValue({ businessId: 'biz-1' });
    mockInvoiceRow(ownedInvoice('1500.00'));
    prismaMock.transaction.create.mockImplementation(async ({ data }: any) => ({ id: 'tx-1', ...data }));
    prismaMock.transaction.aggregate
      .mockResolvedValueOnce({ _sum: { amount: D('0') } }) // no prior payments
      .mockResolvedValue({ _sum: { amount: D('1600.00') } }); // after insert

    await service.reconcileVerifiedDeposit(deposit({ amount: D('1600.00') }));
    const created = prismaMock.transaction.create.mock.calls[0][0].data;
    expect(created.excessAmount.equals(D('100.00'))).toBe(true);
    expect(prismaMock.invoice.update.mock.calls[0][0].data.status).toBe(InvoiceStatus.PAID);
  });

  it('treats a repeated transaction hash as duplicate without new writes', async () => {
    prismaMock.transaction.findUnique.mockResolvedValue({
      id: 'tx-1',
      invoiceId: 'inv-1',
      reconciliationStatus: ReconciliationStatus.MATCHED,
    });
    prismaMock.invoice.findUnique.mockResolvedValue(ownedInvoice('0'));
    prismaMock.invoice.update.mockResolvedValue({});

    const result = await service.reconcileVerifiedDeposit(deposit());
    expect(result.status).toBe('duplicate');
    expect(prismaMock.transaction.create).not.toHaveBeenCalled();
  });
});
