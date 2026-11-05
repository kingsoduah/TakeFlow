import { Injectable } from '@nestjs/common';
import { Prisma, Quote, ValuationMethod } from '@prisma/client';
import { coinDecimals } from '../pricing/catalog.js';
import { cryptoForFiat, valueOfCrypto } from '../pricing/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { rateFromSnapshot, RatesService } from '../rates/rates.service.js';

// Thrown when no fresh rate exists for the coin and currency. The payment
// page then says the price is unavailable; nothing is guessed.
export class PriceUnavailableError extends Error {
  constructor(message = 'Price unavailable') {
    super(message);
    this.name = 'PriceUnavailableError';
  }
}

export const MIN_QUOTE_WINDOW_MINUTES = 2;
export const MAX_QUOTE_WINDOW_MINUTES = 5;

export interface QuotableInvoice {
  id: string;
  currency: string;
  cryptoAsset: string;
  network: string;
  amountOutstanding: Prisma.Decimal;
  business: { quoteWindowMinutes: number };
}

export interface PaymentValuation {
  valuationMethod: ValuationMethod;
  valueCurrency: string;
  valueAmount: Prisma.Decimal;
  valuationRate: Prisma.Decimal;
  rateSnapshotId: string;
  quoteId: string | null;
  valuedAt: Date;
}

// Quotes are always read with their snapshot's time, so the payment page can
// show which rate a quote used ("rate from 14:28").
const WITH_RATE_TIME = { rateSnapshot: { select: { fetchedAt: true } } } as const;
export type QuoteWithRateTime = Prisma.QuoteGetPayload<{ include: typeof WITH_RATE_TIME }>;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function quoteWindowMs(minutes: number | null | undefined): number {
  const value = Number.isInteger(minutes) ? (minutes as number) : MAX_QUOTE_WINDOW_MINUTES;
  const clamped = Math.min(MAX_QUOTE_WINDOW_MINUTES, Math.max(MIN_QUOTE_WINDOW_MINUTES, value));
  return clamped * 60_000;
}

// A quote is active from createdAt until expiresAt, or until endedAt when a
// newer quote replaced it early.
export function isQuoteActiveAt(
  quote: Pick<Quote, 'createdAt' | 'expiresAt' | 'endedAt'>,
  at: Date,
): boolean {
  const end =
    quote.endedAt && quote.endedAt.getTime() < quote.expiresAt.getTime()
      ? quote.endedAt
      : quote.expiresAt;
  return quote.createdAt.getTime() <= at.getTime() && at.getTime() < end.getTime();
}

// Quotes hold the crypto amount for a payment for the business's window
// (2 to 5 minutes). Only one quote per invoice or checkout is active at a
// time: a new one ends the previous one, and a unique sequence number stops
// two requests from both making the next quote.
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: RatesService,
  ) {}

  findLatest(invoiceId: string): Promise<QuoteWithRateTime | null> {
    return this.prisma.quote.findFirst({
      where: { invoiceId },
      orderBy: { sequence: 'desc' },
      include: WITH_RATE_TIME,
    });
  }

  async findActive(invoiceId: string, now: Date = new Date()) {
    const latest = await this.findLatest(invoiceId);
    return latest && isQuoteActiveAt(latest, now) ? latest : null;
  }

  // The quote that was active at a given moment, if any.
  findActiveAt(invoiceId: string, at: Date) {
    return this.prisma.quote.findFirst({
      where: {
        invoiceId,
        createdAt: { lte: at },
        expiresAt: { gt: at },
        OR: [{ endedAt: null }, { endedAt: { gt: at } }],
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Returns the active quote while it still matches what is owed, otherwise
  // makes a new one from a fresh snapshot (or, while the feeds are failing,
  // the last good snapshot from the past 30 minutes).
  async getOrCreate(
    invoice: QuotableInvoice,
    now: Date = new Date(),
  ): Promise<{ quote: QuoteWithRateTime; created: boolean }> {
    if (invoice.amountOutstanding.lessThanOrEqualTo(0)) {
      throw new Error('Nothing is owed, so no quote is needed');
    }
    const latest = await this.findLatest(invoice.id);
    const latestActive = latest !== null && isQuoteActiveAt(latest, now);
    if (
      latest &&
      latestActive &&
      latest.amountDue.equals(invoice.amountOutstanding) &&
      latest.priceCurrency === invoice.currency &&
      latest.cryptoAsset === invoice.cryptoAsset &&
      latest.network === invoice.network
    ) {
      return { quote: latest, created: false };
    }

    const snapshot = await this.rates.getFreshSnapshot(now);
    if (!snapshot) throw new PriceUnavailableError();
    const rate = rateFromSnapshot(snapshot, invoice.cryptoAsset, invoice.currency);
    if (!rate) throw new PriceUnavailableError();

    const cryptoAmount = cryptoForFiat(
      invoice.amountOutstanding,
      rate,
      coinDecimals(invoice.cryptoAsset),
    );
    const expiresAt = new Date(now.getTime() + quoteWindowMs(invoice.business.quoteWindowMinutes));

    let quote: QuoteWithRateTime;
    try {
      quote = await this.prisma.quote.create({
        include: WITH_RATE_TIME,
        data: {
          invoiceId: invoice.id,
          sequence: (latest?.sequence ?? 0) + 1,
          rateSnapshotId: snapshot.id,
          priceCurrency: invoice.currency,
          amountDue: invoice.amountOutstanding,
          cryptoAsset: invoice.cryptoAsset,
          network: invoice.network,
          cryptoAmount,
          rate,
          createdAt: now,
          expiresAt,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Another request made the next quote at the same moment: use it.
      const winner = await this.findLatest(invoice.id);
      if (winner && isQuoteActiveAt(winner, new Date())) {
        return { quote: winner, created: false };
      }
      throw error;
    }

    // The amount owed changed while the old quote was running (for example
    // a part payment arrived). The old quote ends the moment this one starts.
    if (latest && latestActive) {
      await this.prisma.quote.updateMany({
        where: { id: latest.id, endedAt: null },
        data: { endedAt: now },
      });
    }
    return { quote, created: true };
  }

  // Values a matched payment once. Inside an active quote window the quoted
  // rate counts (Agreed); otherwise the latest rate when TakeFlow processes
  // the payment, because Roqqu documents no past rates. Returns null when no
  // fresh rate exists, so the payment is valued on a later delivery.
  async valuePayment(args: {
    invoiceId: string;
    currency: string;
    cryptoAsset: string;
    network: string;
    amount: Prisma.Decimal;
    depositedAt?: Date | null;
    now?: Date;
  }): Promise<PaymentValuation | null> {
    const now = args.now ?? new Date();
    const asset = args.cryptoAsset.toUpperCase();
    if (args.depositedAt) {
      const quote = await this.findActiveAt(args.invoiceId, args.depositedAt);
      if (
        quote &&
        quote.priceCurrency === args.currency &&
        quote.cryptoAsset.toUpperCase() === asset &&
        quote.network === args.network
      ) {
        return {
          valuationMethod: ValuationMethod.QUOTE,
          valueCurrency: args.currency,
          valueAmount: valueOfCrypto(args.amount, quote.rate),
          valuationRate: quote.rate,
          rateSnapshotId: quote.rateSnapshotId,
          quoteId: quote.id,
          valuedAt: now,
        };
      }
    }

    const snapshot = await this.rates.getFreshSnapshot(now);
    if (!snapshot) return null;
    const rate = rateFromSnapshot(snapshot, asset, args.currency);
    if (!rate) return null;
    return {
      valuationMethod: ValuationMethod.ARRIVAL,
      valueCurrency: args.currency,
      valueAmount: valueOfCrypto(args.amount, rate),
      valuationRate: rate,
      rateSnapshotId: snapshot.id,
      quoteId: null,
      valuedAt: now,
    };
  }
}
