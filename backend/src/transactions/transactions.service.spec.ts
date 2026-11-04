import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransactionsService } from './transactions.service.js';

describe('TransactionsService', () => {
  const prismaMock = {
    transaction: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() },
    invoice: { findFirst: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  };
  const businessesMock = { assertOwnership: vi.fn() };
  let service: TransactionsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TransactionsService(
      prismaMock as unknown as PrismaService,
      businessesMock as unknown as BusinessesService,
    );
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

  it('summarizes receivables with zeroed defaults', async () => {
    prismaMock.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal('3000') } })
      .mockResolvedValueOnce({ _sum: { amountReceived: null } })
      .mockResolvedValueOnce({ _sum: { amountOutstanding: null } });
    prismaMock.invoice.groupBy.mockResolvedValue([{ status: 'PAID', _count: { status: 1 } }]);
    prismaMock.transaction.count.mockResolvedValue(2);
    prismaMock.transaction.findMany.mockResolvedValue([]);

    const summary = await service.businessSummary('owner-1', 'biz-1');
    expect(summary.totalInvoiced.toString()).toBe('3000');
    expect(summary.totalReceived.toString()).toBe('0');
    expect(summary.unmatchedTransactionCount).toBe(2);
    expect(summary.invoiceCountByStatus.PAID).toBe(1);
    expect(summary.invoiceCountByStatus.DRAFT).toBe(0);
  });
});
