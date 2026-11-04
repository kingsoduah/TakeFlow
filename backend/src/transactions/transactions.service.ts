import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.js';

// Read-only payment views. All queries are scoped to businesses the caller
// owns; unmatched deposits without a business are invisible here by design.
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async findAll(
    ownerId: string,
    businessId: string,
    query: ListTransactionsQueryDto,
  ) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const { status, limit = 50, offset = 0 } = query;
    const where = { businessId, ...(status ? { reconciliationStatus: status } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: {
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.transaction.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id, businessId },
      include: {
        invoice: { select: { id: true, invoiceNumber: true, status: true } },
      },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }
    return transaction;
  }

  async invoicePayments(ownerId: string, businessId: string, invoiceId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: { client: { select: { id: true, name: true, email: true } } },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    const transactions = await this.prisma.transaction.findMany({
      where: { invoiceId, reconciliationStatus: ReconciliationStatus.MATCHED },
      orderBy: { createdAt: 'asc' },
    });
    return {
      invoice,
      transactions,
      totalReceived: invoice.amountReceived,
      amountOutstanding: invoice.amountOutstanding,
      paymentCount: transactions.length,
    };
  }

  async businessSummary(ownerId: string, businessId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const [invoiced, received, outstanding, statusGroups, unmatchedCount, recent] =
      await Promise.all([
        this.prisma.invoice.aggregate({
          where: { businessId },
          _sum: { amount: true },
        }),
        this.prisma.invoice.aggregate({
          where: { businessId },
          _sum: { amountReceived: true },
        }),
        this.prisma.invoice.aggregate({
          where: { businessId },
          _sum: { amountOutstanding: true },
        }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: { businessId },
          _count: { status: true },
        }),
        this.prisma.transaction.count({
          where: { businessId, reconciliationStatus: ReconciliationStatus.UNMATCHED },
        }),
        this.prisma.transaction.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            invoice: { select: { id: true, invoiceNumber: true } },
          },
        }),
      ]);
    const zero = new Prisma.Decimal(0);
    const byStatus = Object.fromEntries(
      Object.values(InvoiceStatus).map((status) => [status, 0]),
    );
    for (const group of statusGroups) {
      byStatus[group.status] = group._count.status;
    }
    return {
      totalInvoiced: invoiced._sum.amount ?? zero,
      totalReceived: received._sum.amountReceived ?? zero,
      totalOutstanding: outstanding._sum.amountOutstanding ?? zero,
      invoiceCountByStatus: byStatus,
      unmatchedTransactionCount: unmatchedCount,
      recentTransactions: recent,
    };
  }
}
