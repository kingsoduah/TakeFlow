import { Injectable, Logger } from '@nestjs/common';
import { Prisma, RateSnapshot } from '@prisma/client';
import { ACCEPTED_COINS, PRICE_CURRENCIES } from '../pricing/catalog.js';
import { convertFiat, fiatPerCoin } from '../pricing/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CryptoPriceMap, FiatRateEntry } from '../roqqu/roqqu.service.js';
import { RoqquService } from '../roqqu/roqqu.service.js';

// The Roqqu docs say both feeds update every minute, so a fetch is reused
// for 60 seconds. After that every request tries the feeds again.
export const RATES_CACHE_MS = 60_000;
// Design doc 5.1 (Agreed): when the feeds fail, the last good snapshot can
// be used for up to 30 minutes, and the payment page shows its time. Older
// data counts as unavailable: a rate is never guessed.
export const FALLBACK_SNAPSHOT_MAX_AGE_MS = 30 * 60_000;

export interface RatesSnapshot {
  id: string;
  fetchedAt: Date;
  // Units of each currency per 1 USD. Only currencies the feed returned
  // with status 1.
  fiatRates: Record<string, Prisma.Decimal>;
  // USD price of each accepted coin.
  coinPrices: Record<string, Prisma.Decimal>;
}

function positiveDecimal(value: unknown): Prisma.Decimal | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  try {
    // String() keeps the number exactly as JSON delivered it; no float math.
    const parsed = new Prisma.Decimal(String(value).trim());
    return parsed.isFinite() && parsed.greaterThan(0) ? parsed : null;
  } catch {
    return null;
  }
}

// Keeps price currencies that are switched on (status 1) and have a valid
// positive rate.
export function parseFiatRates(data: unknown): Record<string, Prisma.Decimal> {
  if (!Array.isArray(data)) throw new Error('Roqqu /rates returned no list');
  const rates: Record<string, Prisma.Decimal> = {};
  for (const entry of data as FiatRateEntry[]) {
    if (!entry || typeof entry.symbol !== 'string') continue;
    const symbol = entry.symbol.trim().toUpperCase();
    if (!(PRICE_CURRENCIES as readonly string[]).includes(symbol)) continue;
    if (Number(entry.status) !== 1) continue;
    const rate = positiveDecimal(entry.rate);
    if (rate) rates[symbol] = rate;
  }
  return rates;
}

// Keeps the USD prices of the coins TakeFlow accepts.
export function parseCoinPrices(data: unknown): Record<string, Prisma.Decimal> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Roqqu /prices returned no price map');
  }
  const map = data as CryptoPriceMap;
  const prices: Record<string, Prisma.Decimal> = {};
  for (const coin of ACCEPTED_COINS) {
    const price = positiveDecimal(map[coin.toLowerCase()]?.price);
    if (price) prices[coin] = price;
  }
  return prices;
}

function toJson(values: Record<string, Prisma.Decimal>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.toFixed()]));
}

function fromJson(value: Prisma.JsonValue): Record<string, Prisma.Decimal> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, Prisma.Decimal> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = positiveDecimal(raw);
    if (parsed) out[key] = parsed;
  }
  return out;
}

export function snapshotFromRow(row: RateSnapshot): RatesSnapshot {
  return {
    id: row.id,
    fetchedAt: row.fetchedAt,
    fiatRates: fromJson(row.fiatRates),
    coinPrices: fromJson(row.coinPrices),
  };
}

// Price currency per 1 coin from a snapshot, or null when the snapshot lacks
// the coin or the currency (for example a currency whose status is off).
export function rateFromSnapshot(
  snapshot: RatesSnapshot,
  cryptoAsset: string,
  currency: string,
): Prisma.Decimal | null {
  const price = snapshot.coinPrices[cryptoAsset.toUpperCase()];
  const fiat = snapshot.fiatRates[currency.toUpperCase()];
  if (!price || !fiat) return null;
  return fiatPerCoin(price, fiat);
}

// Converts a fiat amount between two price currencies with one snapshot.
export function convertWithSnapshot(
  amount: Prisma.Decimal,
  from: string,
  to: string,
  snapshot: RatesSnapshot,
): Prisma.Decimal | null {
  if (from === to) return amount;
  const fromRate = snapshot.fiatRates[from];
  const toRate = snapshot.fiatRates[to];
  if (!fromRate || !toRate) return null;
  return convertFiat(amount, fromRate, toRate);
}

// Reads Roqqu's /rates and /prices feeds, keeps the result for 60 seconds
// and saves every fetch as a RateSnapshot so each quote and payment value
// can point at the exact rates it used.
@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);
  private cached: RatesSnapshot | null = null;
  private inFlight: Promise<RatesSnapshot | null> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly roqqu: RoqquService,
  ) {}

  // A fresh snapshot whenever the feeds respond (reused for 60 seconds).
  // When they fail, the last good snapshot from the past 30 minutes. Null
  // when neither exists.
  async getFreshSnapshot(now: Date = new Date()): Promise<RatesSnapshot | null> {
    if (this.cached && now.getTime() - this.cached.fetchedAt.getTime() < RATES_CACHE_MS) {
      return this.cached;
    }
    if (!this.inFlight) {
      // Concurrent callers share one fetch.
      this.inFlight = this.refresh().finally(() => {
        this.inFlight = null;
      });
    }
    const fetched = await this.inFlight;
    if (fetched) return fetched;

    const cutoff = now.getTime() - FALLBACK_SNAPSHOT_MAX_AGE_MS;
    if (this.cached && this.cached.fetchedAt.getTime() > cutoff) return this.cached;
    try {
      const row = await this.prisma.rateSnapshot.findFirst({
        where: { fetchedAt: { gt: new Date(cutoff) } },
        orderBy: { fetchedAt: 'desc' },
      });
      return row ? snapshotFromRow(row) : null;
    } catch {
      return null;
    }
  }

  async getSnapshotsByIds(ids: string[]): Promise<Map<string, RatesSnapshot>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.rateSnapshot.findMany({ where: { id: { in: ids } } });
    return new Map(rows.map((row) => [row.id, snapshotFromRow(row)]));
  }

  private async refresh(): Promise<RatesSnapshot | null> {
    try {
      const [rates, prices] = await Promise.all([
        this.roqqu.getFiatRates(),
        this.roqqu.getCryptoPrices(),
      ]);
      if (rates?.status !== 'success' || prices?.status !== 'success') {
        throw new Error('Roqqu market feed did not report success');
      }
      const fiatRates = parseFiatRates(rates.data);
      const coinPrices = parseCoinPrices(prices.data);
      const row = await this.prisma.rateSnapshot.create({
        data: {
          fetchedAt: new Date(),
          fiatRates: toJson(fiatRates),
          coinPrices: toJson(coinPrices),
        },
      });
      const snapshot = snapshotFromRow(row);
      this.cached = snapshot;
      return snapshot;
    } catch (error) {
      this.logger.warn(
        `Rate feeds unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }
}
