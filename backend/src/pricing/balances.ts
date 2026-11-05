import { InvoiceStatus, Prisma } from '@prisma/client';
import { overpaymentMinorUnit } from './catalog.js';
import { percentOfBps, subtractMoney } from './money.js';

export interface BalanceInput {
  amount: Prisma.Decimal; // Price in the price currency
  received: Prisma.Decimal; // Sum of the stored values of matched payments
  currency: string;
  shortfallToleranceBps: number;
  currentStatus: InvoiceStatus;
}

export interface Balances {
  amountReceived: Prisma.Decimal;
  amountOutstanding: Prisma.Decimal;
  amountOverpaid: Prisma.Decimal;
  status: InvoiceStatus;
}

const ZERO = new Prisma.Decimal(0);

// Overpayment that is worth reporting: anything under one minor unit of the
// currency (NGN 1, GBP 0.01) is treated as zero.
export function reportableOverpayment(
  received: Prisma.Decimal,
  amount: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  const excess = subtractMoney(received, amount);
  return excess.greaterThanOrEqualTo(overpaymentMinorUnit(currency)) ? excess : ZERO;
}

// The overpayment a single new payment adds, so the excess on each payment
// record sums to the invoice's total overpayment.
export function excessForPayment(
  receivedBefore: Prisma.Decimal,
  receivedAfter: Prisma.Decimal,
  amount: Prisma.Decimal,
  currency: string,
): Prisma.Decimal {
  const added = subtractMoney(
    reportableOverpayment(receivedAfter, amount, currency),
    reportableOverpayment(receivedBefore, amount, currency),
  );
  return Prisma.Decimal.max(ZERO, added);
}

// Status and balances from the amount received. Safe to run any number of
// times with the same result.
// - A shortfall smaller than the tolerance (default 0.5% of the price)
//   counts as paid, and nothing is shown as owed.
// - Otherwise amount owed = price minus received, never below zero.
// - Payment statuses override DRAFT, PENDING, OVERDUE and EXPIRED, so money
//   that arrives is never hidden.
export function computeBalances(input: BalanceInput): Balances {
  const { amount, received, currency } = input;
  const bps = Number.isInteger(input.shortfallToleranceBps) ? input.shortfallToleranceBps : 0;
  const shortfall = subtractMoney(amount, received);
  const tolerance = percentOfBps(amount, Math.max(0, bps));
  const paid =
    received.greaterThan(0) &&
    (shortfall.lessThanOrEqualTo(0) || shortfall.lessThan(tolerance));

  return {
    amountReceived: received,
    amountOutstanding: paid ? ZERO : Prisma.Decimal.max(ZERO, shortfall),
    amountOverpaid: reportableOverpayment(received, amount, currency),
    status: paid
      ? InvoiceStatus.PAID
      : received.greaterThan(0)
        ? InvoiceStatus.PARTIALLY_PAID
        : input.currentStatus,
  };
}
