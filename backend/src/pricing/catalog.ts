// Static lists that pricing input is validated against. The live Roqqu
// /rates feed is still checked when quoting: a currency in this list that the
// feed does not return with status 1 gets no quote.

// Price currencies. These are the five currencies GET /rates returned with
// status 1 on 5 Nov 2026.
export const PRICE_CURRENCIES = ['NGN', 'USD', 'GBP', 'EUR', 'GHS'] as const;
export type PriceCurrency = (typeof PRICE_CURRENCIES)[number];

export function isPriceCurrency(value: unknown): value is PriceCurrency {
  return typeof value === 'string' && (PRICE_CURRENCIES as readonly string[]).includes(value);
}

// Smallest excess that is reported as an overpayment (design doc 5.3 gives
// the naira unit as 1 and the pound unit as 0.01).
export const OVERPAYMENT_MINOR_UNIT: Record<PriceCurrency, string> = {
  NGN: '1',
  USD: '0.01',
  GBP: '0.01',
  EUR: '0.01',
  GHS: '0.01',
};

export function overpaymentMinorUnit(currency: string): string {
  return isPriceCurrency(currency) ? OVERPAYMENT_MINOR_UNIT[currency] : '0.01';
}

// Accepted coin and network pairs. Network codes are exactly as Roqqu uses
// them. USDT on erc20 stays out until Roqqu confirms it.
export const ACCEPTED_PAYMENT_PAIRS = [
  { cryptoAsset: 'USDT', network: 'trc20' },
  { cryptoAsset: 'USDT', network: 'bep20' },
  { cryptoAsset: 'USDC', network: 'base' },
] as const;

export const ACCEPTED_COINS = ['USDT', 'USDC'] as const;
export const ACCEPTED_NETWORKS = ['trc20', 'bep20', 'base'] as const;

export function isAcceptedPaymentPair(cryptoAsset: unknown, network: unknown): boolean {
  return ACCEPTED_PAYMENT_PAIRS.some(
    (pair) => pair.cryptoAsset === cryptoAsset && pair.network === network,
  );
}

// Display precision of each accepted coin. Quoted crypto amounts are rounded
// up to this many decimal places so the business never receives less than
// the price.
export const COIN_DECIMALS: Record<string, number> = {
  USDT: 2,
  USDC: 2,
};

export function coinDecimals(cryptoAsset: string): number {
  return COIN_DECIMALS[cryptoAsset.toUpperCase()] ?? 2;
}

export const ACCEPTED_PAIRS_TEXT = ACCEPTED_PAYMENT_PAIRS.map(
  (pair) => `${pair.cryptoAsset} on ${pair.network}`,
).join(', ');
