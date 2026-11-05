import { Injectable, NotFoundException } from '@nestjs/common';
import { InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service.js';
import { expireStaleCheckouts } from '../checkouts/checkout-rules.js';
import { resolveDisplayCurrency } from '../pricing/display-currency.js';
import { roundMoney, sumDecimals } from '../pricing/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { convertWithSnapshot, RatesService, RatesSnapshot } from '../rates/rates.service.js';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.js';
import { SummaryQueryDto } from './dto/summary.query.js';

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal) => value.toFixed();

// Drafts are not issued and expired links can no longer be paid, so neither
// counts towards invoiced or outstanding totals.
const NOT_COUNTED: InvoiceStatus[] = [InvoiceStatus.DRAFT, InvoiceStatus.EXPIRED];

// Read-only payment views. All queries are scoped to businesses the caller
// owns; unmatched deposits without a business are invisible here by design.
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
    private readonly rates: RatesService,
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

  // Dashboard totals (design doc 5.8). Amounts are never added across
  // currencies: byCurrency gives each price currency its own totals, and the
  // top level totals are converted to one display currency. Money received
  // converts at the snapshot each payment was valued with; amounts invoiced
  // and still owed convert at the latest rate. A total that needs a rate we
  // do not have is null rather than guessed.
  async businessSummary(ownerId: string, businessId: string, query: SummaryQueryDto = {}) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const now = new Date();
    await expireStaleCheckouts(this.prisma, businessId, now);
    const displayCurrency =
      query.currency ?? (await resolveDisplayCurrency(this.prisma, ownerId));
    const kindFilter = query.kind ? { kind: query.kind } : {};

    const [buckets, statusGroups, unmatchedCount, unvaluedCount, recent, receivedGroups] =
      await Promise.all([
        this.prisma.invoice.groupBy({
          by: ['currency'],
          where: { businessId, ...kindFilter, status: { notIn: NOT_COUNTED } },
          _sum: {
            amount: true,
            amountReceived: true,
            amountOutstanding: true,
            amountOverpaid: true,
          },
          _count: { _all: true },
        }),
        this.prisma.invoice.groupBy({
          by: ['status'],
          where: { businessId, ...kindFilter },
          _count: { status: true },
        }),
        this.prisma.transaction.count({
          where: { businessId, reconciliationStatus: ReconciliationStatus.UNMATCHED },
        }),
        this.prisma.transaction.count({
          where: {
            businessId,
            reconciliationStatus: ReconciliationStatus.MATCHED,
            valueAmount: null,
          },
        }),
        this.prisma.transaction.findMany({
          where: { businessId },
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: {
            invoice: { select: { id: true, invoiceNumber: true, kind: true } },
          },
        }),
        this.prisma.transaction.groupBy({
          by: ['valueCurrency', 'rateSnapshotId'],
          where: {
            businessId,
            reconciliationStatus: ReconciliationStatus.MATCHED,
            valueAmount: { not: null },
            ...(query.kind ? { invoice: { is: { kind: query.kind } } } : {}),
          },
          _sum: { valueAmount: true },
        }),
      ]);

    const byStatus = Object.fromEntries(
      Object.values(InvoiceStatus).map((status) => [status, 0]),
    );
    for (const group of statusGroups) {
      byStatus[group.status] = group._count.status;
    }

    // The latest snapshot is only fetched when some amount needs converting.
    let today: RatesSnapshot | null | undefined;
    const latest = async () => {
      if (today === undefined) today = await this.rates.getFreshSnapshot(now);
      return today;
    };

    let convertible = true;
    const invoiced: Prisma.Decimal[] = [];
    const outstanding: Prisma.Decimal[] = [];
    for (const bucket of buckets) {
      const amount = bucket._sum.amount ?? ZERO;
      const owed = bucket._sum.amountOutstanding ?? ZERO;
      if (bucket.currency === displayCurrency) {
        invoiced.push(amount);
        outstanding.push(owed);
        continue;
      }
      const snapshot = await latest();
      const convertedAmount = snapshot
        ? convertWithSnapshot(amount, bucket.currency, displayCurrency, snapshot)
        : null;
      const convertedOwed = snapshot
        ? convertWithSnapshot(owed, bucket.currency, displayCurrency, snapshot)
        : null;
      if (!convertedAmount || !convertedOwed) {
        convertible = false;
        continue;
      }
      invoiced.push(convertedAmount);
      outstanding.push(convertedOwed);
    }

    const historicIds = [
      ...new Set(
        receivedGroups
          .filter((group) => group.valueCurrency !== displayCurrency && group.rateSnapshotId)
          .map((group) => group.rateSnapshotId as string),
      ),
    ];
    const historic = await this.rates.getSnapshotsByIds(historicIds);
    const received: Prisma.Decimal[] = [];
    for (const group of receivedGroups) {
      const value = group._sum.valueAmount ?? ZERO;
      const currency = group.valueCurrency;
      if (!currency) continue;
      if (currency === displayCurrency) {
        received.push(value);
        continue;
      }
      const atPayment = group.rateSnapshotId ? historic.get(group.rateSnapshotId) : undefined;
      let converted = atPayment
        ? convertWithSnapshot(value, currency, displayCurrency, atPayment)
        : null;
      if (!converted) {
        // The payment's own snapshot lacks the display currency (it may have
        // been switched off then), so the latest rate is used instead.
        const snapshot = await latest();
        converted = snapshot
          ? convertWithSnapshot(value, currency, displayCurrency, snapshot)
          : null;
      }
      if (!converted) {
        convertible = false;
        continue;
      }
      received.push(converted);
    }

    const total = (values: Prisma.Decimal[]) =>
      convertible ? money(roundMoney(sumDecimals(values))) : null;

    return {
      displayCurrency,
      totalInvoiced: total(invoiced),
      totalReceived: total(received),
      totalOutstanding: total(outstanding),
      ratesAsOf: today ? today.fetchedAt : null,
      byCurrency: buckets
        .map((bucket) => ({
          currency: bucket.currency,
          invoiceCount: bucket._count._all,
          totalInvoiced: money(bucket._sum.amount ?? ZERO),
          totalReceived: money(bucket._sum.amountReceived ?? ZERO),
          totalOutstanding: money(bucket._sum.amountOutstanding ?? ZERO),
          totalOverpaid: money(bucket._sum.amountOverpaid ?? ZERO),
        }))
        .sort((a, b) => a.currency.localeCompare(b.currency)),
      invoiceCountByStatus: byStatus,
      unmatchedTransactionCount: unmatchedCount,
      unvaluedPaymentCount: unvaluedCount,
      recentTransactions: recent,
    };
  }
}
