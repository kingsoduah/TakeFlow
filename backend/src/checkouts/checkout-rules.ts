import { Invoice, InvoiceKind, InvoiceStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';

// Design doc 5.5 (Proposed): checkout links expire after 24 hours by default.
export const DEFAULT_CHECKOUT_EXPIRY_MINUTES = 24 * 60;
export const MAX_CHECKOUT_EXPIRY_MINUTES = 30 * 24 * 60;
export const MIN_CHECKOUT_EXPIRY_MINUTES = 5;

const PAYABLE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.PENDING,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

type StatusFields = Pick<Invoice, 'kind' | 'status' | 'expiresAt'>;

// An unpaid checkout past its expiry. Part paid checkouts never expire, so
// the payer can always finish paying (design doc 5.5: the order is not
// failed).
export function isPastExpiry(invoice: StatusFields, now: Date): boolean {
  return (
    invoice.kind === InvoiceKind.CHECKOUT &&
    invoice.status === InvoiceStatus.PENDING &&
    invoice.expiresAt !== null &&
    invoice.expiresAt.getTime() <= now.getTime()
  );
}

// Whether a payer can get a quote right now.
export function isPayable(
  invoice: StatusFields & { amountOutstanding: Prisma.Decimal },
  now: Date,
): boolean {
  return (
    PAYABLE_STATUSES.includes(invoice.status) &&
    invoice.amountOutstanding.greaterThan(0) &&
    !isPastExpiry(invoice, now)
  );
}

// Statuses are kept right without a scheduler: an unpaid checkout past its
// expiry is moved to EXPIRED when it is next read. The condition on status
// means a payment that arrived meanwhile is never overwritten.
export async function expireIfStale<T extends StatusFields & { id: string }>(
  prisma: PrismaService,
  invoice: T,
  now: Date,
): Promise<T> {
  if (!isPastExpiry(invoice, now)) return invoice;
  await prisma.invoice.updateMany({
    where: { id: invoice.id, status: InvoiceStatus.PENDING },
    data: { status: InvoiceStatus.EXPIRED },
  });
  return { ...invoice, status: InvoiceStatus.EXPIRED };
}

export async function expireStaleCheckouts(
  prisma: PrismaService,
  businessId: string,
  now: Date,
): Promise<void> {
  await prisma.invoice.updateMany({
    where: {
      businessId,
      kind: InvoiceKind.CHECKOUT,
      status: InvoiceStatus.PENDING,
      expiresAt: { lte: now },
    },
    data: { status: InvoiceStatus.EXPIRED },
  });
}

export function generateCheckoutNumber(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
  return `CHK-${stamp}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

export function generateProductLinkReference(): string {
  return `link_${randomBytes(16).toString('hex')}`;
}

export const PAYMENT_REFERENCE_PATTERN = /^pay_[0-9a-f]{32}$/;
export const PRODUCT_LINK_REFERENCE_PATTERN = /^link_[0-9a-f]{32}$/;
