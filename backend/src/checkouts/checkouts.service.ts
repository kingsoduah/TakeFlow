import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Invoice, InvoiceKind, InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service.js';
import { generatePaymentReference } from '../invoices/invoices.service.js';
import { assertPriceable } from '../pricing/assert-priceable.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DEFAULT_CHECKOUT_EXPIRY_MINUTES,
  expireIfStale,
  expireStaleCheckouts,
  generateCheckoutNumber,
} from './checkout-rules.js';
import { ListCheckoutsQueryDto } from './dto/checkout.dto.js';

export interface CheckoutInput {
  amount: string | number;
  currency: string;
  cryptoAsset: string;
  network: string;
  description?: string;
  orderId?: string;
  buyerName?: string;
  buyerEmail?: string;
  returnUrl?: string | null;
  expiresInMinutes?: number;
  // Set only by the product link flow, never from request bodies.
  productLinkId?: string;
}

const money = (value: Prisma.Decimal) => value.toFixed();

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

// The shape a shop sees for a checkout (dashboard and API key routes).
export function toCheckoutView(row: Invoice) {
  return {
    id: row.id,
    paymentReference: row.paymentReference,
    invoiceNumber: row.invoiceNumber,
    status: row.status,
    amount: money(row.amount),
    currency: row.currency,
    amountReceived: money(row.amountReceived),
    amountOutstanding: money(row.amountOutstanding),
    amountOverpaid: money(row.amountOverpaid),
    cryptoAsset: row.cryptoAsset,
    network: row.network,
    paymentAddress: row.paymentAddress,
    orderId: row.externalOrderId,
    description: row.description,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    returnUrl: row.returnUrl,
    expiresAt: row.expiresAt,
    productLinkId: row.productLinkId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// One-order checkouts (design doc 5.5). A checkout is an Invoice row with
// kind CHECKOUT, so reconciliation, valuation and the payment page work the
// same as for invoices. It needs the full price (within the business's
// shortfall tolerance) to count as PAID; less shows as PARTIALLY_PAID with
// the missing amount, and the payer can get a quote for the rest.
@Injectable()
export class CheckoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async createForOwner(ownerId: string, businessId: string, input: CheckoutInput) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const { checkout } = await this.create(businessId, input);
    return toCheckoutView(checkout);
  }

  // Shared by the dashboard, the API key routes and product links. With an
  // orderId the call is idempotent: the same order always gets the same
  // checkout, so a retry never makes two.
  async create(
    businessId: string,
    input: CheckoutInput,
    now: Date = new Date(),
  ): Promise<{ checkout: Invoice; created: boolean }> {
    assertPriceable(input.currency, input.cryptoAsset, input.network);
    const amount = new Prisma.Decimal(String(input.amount));

    if (input.orderId) {
      const existing = await this.findByOrderId(businessId, input.orderId);
      if (existing) return { checkout: this.assertSameOrder(existing, amount, input), created: false };
    }

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { shortfallToleranceBps: true },
    });
    if (!business) throw new NotFoundException('Business not found');

    const minutes = input.expiresInMinutes ?? DEFAULT_CHECKOUT_EXPIRY_MINUTES;
    const expiresAt = new Date(now.getTime() + minutes * 60_000);

    // Generated-value collisions are retried with fresh values. A race on
    // the same orderId resolves to the checkout that won.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const checkout = await this.prisma.invoice.create({
          data: {
            businessId,
            kind: InvoiceKind.CHECKOUT,
            invoiceNumber: generateCheckoutNumber(now),
            paymentReference: generatePaymentReference(),
            description: input.description,
            amount,
            currency: input.currency,
            cryptoAsset: input.cryptoAsset,
            network: input.network,
            issueDate: now,
            dueDate: expiresAt,
            expiresAt,
            status: InvoiceStatus.PENDING,
            amountOutstanding: amount,
            shortfallToleranceBps: business.shortfallToleranceBps,
            externalOrderId: input.orderId ?? null,
            buyerName: input.buyerName ?? null,
            buyerEmail: input.buyerEmail ?? null,
            returnUrl: input.returnUrl ?? null,
            productLinkId: input.productLinkId ?? null,
          },
        });
        return { checkout, created: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (input.orderId) {
          const existing = await this.findByOrderId(businessId, input.orderId);
          if (existing) {
            return { checkout: this.assertSameOrder(existing, amount, input), created: false };
          }
        }
      }
    }
    throw new ConflictException('Could not allocate a unique checkout reference');
  }

  async listForOwner(ownerId: string, businessId: string, query: ListCheckoutsQueryDto) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    await expireStaleCheckouts(this.prisma, businessId, new Date());
    const { status, productLinkId, limit = 50, offset = 0 } = query;
    const where = {
      businessId,
      kind: InvoiceKind.CHECKOUT,
      ...(status ? { status } : {}),
      ...(productLinkId ? { productLinkId } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data: rows.map(toCheckoutView), total, limit, offset };
  }

  async findOneForOwner(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    return this.findForBusiness(businessId, id);
  }

  // Detail with payments, for a business already identified (JWT owner or
  // API key). Foreign or unknown ids are 404.
  async findForBusiness(businessId: string, id: string) {
    const row = await this.prisma.invoice.findFirst({
      where: { id, businessId, kind: InvoiceKind.CHECKOUT },
    });
    if (!row) throw new NotFoundException('Checkout not found');
    return this.detail(row);
  }

  async findForBusinessByOrderId(businessId: string, orderId: string) {
    const row = await this.findByOrderId(businessId, orderId);
    if (!row) throw new NotFoundException('Checkout not found');
    return this.detail(row);
  }

  async detail(row: Invoice) {
    const current = await expireIfStale(this.prisma, row, new Date());
    const payments = await this.prisma.transaction.findMany({
      where: { invoiceId: row.id, reconciliationStatus: ReconciliationStatus.MATCHED },
      orderBy: { createdAt: 'asc' },
    });
    return {
      ...toCheckoutView(current),
      payments: payments.map((payment) => ({
        transactionHash: payment.transactionHash,
        asset: payment.asset,
        network: payment.network,
        amount: money(payment.amount),
        valueAmount: payment.valueAmount ? money(payment.valueAmount) : null,
        valueCurrency: payment.valueCurrency,
        valuationRate: payment.valuationRate ? money(payment.valuationRate) : null,
        valuationMethod: payment.valuationMethod,
        depositedAt: payment.depositedAt,
        receivedAt: payment.createdAt,
      })),
    };
  }

  private findByOrderId(businessId: string, orderId: string) {
    return this.prisma.invoice.findFirst({
      where: { businessId, externalOrderId: orderId, kind: InvoiceKind.CHECKOUT },
    });
  }

  // A repeated orderId must describe the same order. A different price
  // would otherwise be silently ignored.
  private assertSameOrder(existing: Invoice, amount: Prisma.Decimal, input: CheckoutInput): Invoice {
    const same =
      existing.amount.equals(amount) &&
      existing.currency === input.currency &&
      existing.cryptoAsset === input.cryptoAsset &&
      existing.network === input.network;
    if (!same) {
      throw new ConflictException(
        'This orderId already has a checkout with a different price, currency, coin or network',
      );
    }
    return existing;
  }
}
