import { Prisma } from '@prisma/client';

// All money and rate math goes through these helpers. Plan section 13.5:
// precise decimal arithmetic, never JavaScript floats.
//
// Prisma.Decimal keeps only 20 significant digits per operation. A rate with
// 15 decimal places times a six figure amount needs more than that, so each
// step runs on a 64 digit copy of the Decimal class and every result is
// rounded explicitly before it leaves this file.
const Precise = Prisma.Decimal.clone({
  precision: 64,
  rounding: Prisma.Decimal.ROUND_HALF_UP,
});

export type MoneyInput = Prisma.Decimal | string;

// Matches the @db.Decimal(30, 18) columns, so a value computed here is
// exactly the value Postgres stores.
export const STORED_DECIMALS = 18;

function precise(value: MoneyInput): Prisma.Decimal {
  return new Precise(value.toString());
}

function toStored(
  value: Prisma.Decimal,
  places = STORED_DECIMALS,
  rounding: Prisma.Decimal.Rounding = Prisma.Decimal.ROUND_HALF_UP,
): Prisma.Decimal {
  return new Prisma.Decimal(value.toDecimalPlaces(places, rounding).toFixed());
}

export function decimal(value: MoneyInput): Prisma.Decimal {
  return new Prisma.Decimal(value.toString());
}

function assertPositive(value: Prisma.Decimal, label: string) {
  if (!value.isFinite() || value.lessThanOrEqualTo(0)) {
    throw new Error(`${label} must be a positive number`);
  }
}

// Price currency per 1 coin = the coin's USD price x currency units per USD.
// Example: 1 USDC = 0.999862311183132 x 0.75 = 0.74989673338734900 GBP.
export function fiatPerCoin(coinUsdPrice: MoneyInput, fiatPerUsd: MoneyInput): Prisma.Decimal {
  const price = precise(coinUsdPrice);
  const fiat = precise(fiatPerUsd);
  assertPositive(price, 'Coin price');
  assertPositive(fiat, 'Fiat rate');
  return toStored(price.times(fiat));
}

// Crypto to send for a fiat amount, rounded UP to the coin's display
// precision so the business never receives less than the price.
// Example: GBP 1,000 at 0.75 GBP per USDT = 1,333.333... -> 1,333.34 USDT.
export function cryptoForFiat(
  fiatAmount: MoneyInput,
  rate: MoneyInput,
  coinDecimals: number,
): Prisma.Decimal {
  const amount = precise(fiatAmount);
  const perCoin = precise(rate);
  assertPositive(perCoin, 'Rate');
  if (amount.lessThan(0)) throw new Error('Amount must not be negative');
  return toStored(amount.dividedBy(perCoin), coinDecimals, Prisma.Decimal.ROUND_CEIL);
}

// Value of received crypto in the price currency: crypto x rate.
// Example: 600 USDT at 0.75 GBP per USDT = GBP 450.
export function valueOfCrypto(cryptoAmount: MoneyInput, rate: MoneyInput): Prisma.Decimal {
  const perCoin = precise(rate);
  assertPositive(perCoin, 'Rate');
  return toStored(precise(cryptoAmount).times(perCoin));
}

// Converts between two fiat currencies through their per-USD rates:
// amount / (from per USD) x (to per USD).
export function convertFiat(
  amount: MoneyInput,
  fromPerUsd: MoneyInput,
  toPerUsd: MoneyInput,
): Prisma.Decimal {
  const from = precise(fromPerUsd);
  const to = precise(toPerUsd);
  assertPositive(from, 'Source rate');
  assertPositive(to, 'Target rate');
  return toStored(precise(amount).times(to).dividedBy(from));
}

// Display rounding for converted totals (half up).
export function roundMoney(amount: MoneyInput, places = 2): Prisma.Decimal {
  return toStored(precise(amount), places, Prisma.Decimal.ROUND_HALF_UP);
}

// tolerance = price x basis points / 10,000 (50 bps = 0.5%).
export function percentOfBps(amount: MoneyInput, bps: number): Prisma.Decimal {
  if (!Number.isInteger(bps) || bps < 0) throw new Error('Basis points must be a whole number');
  return toStored(precise(amount).times(bps).dividedBy(10000));
}

// Exact addition and subtraction of stored values (each has at most 18
// decimal places, so nothing is lost).
export function addMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toStored(precise(a).plus(precise(b)));
}

export function subtractMoney(a: MoneyInput, b: MoneyInput): Prisma.Decimal {
  return toStored(precise(a).minus(precise(b)));
}

export function sumDecimals(values: Array<Prisma.Decimal | null | undefined>): Prisma.Decimal {
  let total = new Precise(0);
  for (const value of values) {
    if (value) total = total.plus(value.toString());
  }
  return toStored(total);
}
