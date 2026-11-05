import { Injectable, Logger } from '@nestjs/common';
import { Prisma, ReconciliationStatus, Transaction } from '@prisma/client';
import { computeBalances, excessForPayment } from '../pricing/balances.js';
import { addMoney } from '../pricing/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentValuation, QuotesService } from '../quotes/quotes.service.js';

export interface VerifiedDeposit {
  transactionHash: string;
  receivingAddress: string;
  senderAddress?: string;
  asset: string; // uppercased token symbol
  network: string;
  amount: Prisma.Decimal;
  providerReference?: string;
  providerStatus?: number;
  occurredAt?: Date;
  // Deposit time for the quote window: Roqqu's deposit record created_at,
  // or the webhook datetime when that is missing.
  depositedAt?: Date;
}

export interface ReconcileResult {
  status: 'matched' | 'unmatched' | 'duplicate';
  transactionId: string;
  invoiceId: string | null;
}

const ZERO = new Prisma.Decimal(0);

function valuationData(valuation: PaymentValuation | null) {
  if (!valuation) return {};
  return {
    valueCurrency: valuation.valueCurrency,
    valueAmount: valuation.valueAmount,
    valuationRate: valuation.valuationRate,
    valuationMethod: valuation.valuationMethod,
    valuedAt: valuation.valuedAt,
    rateSnapshotId: valuation.rateSnapshotId,
    quoteId: valuation.quoteId,
  };
}

// Matches a VERIFIED deposit to an invoice or checkout, values it once in the
// price currency, and updates balances. All money uses Prisma.Decimal.
// Reconciliation is idempotent: a payment's value is computed at first match
// and stored, and balances are recomputed from the sum of stored values, so
// redeliveries converge instead of double-crediting. No interactive DB
// transactions are used (the Neon serverless adapter does not support them);
// uniqueness constraints on transactionHash make concurrent inserts safe.
@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
  ) {}

  async reconcileVerifiedDeposit(deposit: VerifiedDeposit): Promise<ReconcileResult> {
    const existing = await this.prisma.transaction.findUnique({
      where: { transactionHash: deposit.transactionHash },
    });
    if (existing) {
      if (existing.reconciliationStatus === ReconciliationStatus.MATCHED) {
        // A payment matched while no rate was available gets its one and
        // only valuation now. Valued payments are never valued again.
        if (existing.valueAmount === null) {
          await this.valuePending(existing);
        }
        await this.recomputeInvoice(existing.invoiceId);
      }
      return {
        status: 'duplicate',
        transactionId: existing.id,
        invoiceId: existing.invoiceId,
      };
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { address: deposit.receivingAddress },
      select: { businessId: true },
    });

    const invoice = wallet
      ? await this.prisma.invoice.findFirst({
          where: {
            businessId: wallet.businessId,
            paymentAddress: deposit.receivingAddress,
          },
        })
      : null;

    const assetMatches =
      invoice !== null &&
      invoice.cryptoAsset.toUpperCase() === deposit.asset.toUpperCase() &&
      invoice.network === deposit.network;

    if (!invoice || !assetMatches) {
      const unmatched = await this.prisma.transaction.create({
        data: {
          businessId: wallet?.businessId ?? null,
          transactionHash: deposit.transactionHash,
          receivingAddress: deposit.receivingAddress,
          senderAddress: deposit.senderAddress,
          asset: deposit.asset.toUpperCase(),
          network: deposit.network,
          amount: deposit.amount,
          providerReference: deposit.providerReference,
          providerStatus: deposit.providerStatus,
          reconciliationStatus: ReconciliationStatus.UNMATCHED,
          occurredAt: deposit.occurredAt,
          depositedAt: deposit.depositedAt,
        },
      });
      return { status: 'unmatched', transactionId: unmatched.id, invoiceId: null };
    }

    const valuation = await this.quotes.valuePayment({
      invoiceId: invoice.id,
      currency: invoice.currency,
      cryptoAsset: deposit.asset,
      network: deposit.network,
      amount: deposit.amount,
      depositedAt: deposit.depositedAt,
    });
    if (!valuation) {
      this.logger.warn(
        `No fresh rate to value payment ${deposit.transactionHash}; it is stored unvalued and valued on a later delivery`,
      );
    }

    const before = await this.sumMatched(invoice.id);
    const excess = valuation
      ? excessForPayment(
          before,
          addMoney(before, valuation.valueAmount),
          invoice.amount,
          invoice.currency,
        )
      : ZERO;

    const transaction = await this.prisma.transaction.create({
      data: {
        businessId: invoice.businessId,
        invoiceId: invoice.id,
        transactionHash: deposit.transactionHash,
        receivingAddress: deposit.receivingAddress,
        senderAddress: deposit.senderAddress,
        asset: deposit.asset.toUpperCase(),
        network: deposit.network,
        amount: deposit.amount,
        excessAmount: excess,
        providerReference: deposit.providerReference,
        providerStatus: deposit.providerStatus,
        reconciliationStatus: ReconciliationStatus.MATCHED,
        occurredAt: deposit.occurredAt,
        depositedAt: deposit.depositedAt,
        ...valuationData(valuation),
      },
    });

    await this.recomputeInvoice(invoice.id);
    return { status: 'matched', transactionId: transaction.id, invoiceId: invoice.id };
  }

  // First valuation of a matched payment that had no rate at match time.
  // The conditional update makes sure only one valuation is ever written.
  private async valuePending(transaction: Transaction): Promise<void> {
    if (!transaction.invoiceId) return;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: transaction.invoiceId },
    });
    if (!invoice) return;
    const valuation = await this.quotes.valuePayment({
      invoiceId: invoice.id,
      currency: invoice.currency,
      cryptoAsset: transaction.asset,
      network: transaction.network,
      amount: transaction.amount,
      depositedAt: transaction.depositedAt,
    });
    if (!valuation) return;
    const before = await this.sumMatched(invoice.id);
    await this.prisma.transaction.updateMany({
      where: { id: transaction.id, valueAmount: null },
      data: {
        ...valuationData(valuation),
        excessAmount: excessForPayment(
          before,
          addMoney(before, valuation.valueAmount),
          invoice.amount,
          invoice.currency,
        ),
      },
    });
  }

  // Sum of stored values (price currency) over matched payments. Unvalued
  // payments add nothing until they are valued.
  private async sumMatched(invoiceId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.transaction.aggregate({
      where: { invoiceId, reconciliationStatus: ReconciliationStatus.MATCHED },
      _sum: { valueAmount: true },
    });
    return result._sum.valueAmount ?? ZERO;
  }

  // Recomputes an invoice from its matched payments' stored values. Safe to
  // run any number of times with the same result.
  async recomputeInvoice(invoiceId: string | null): Promise<void> {
    if (!invoiceId) return;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;
    const received = await this.sumMatched(invoiceId);
    const balances = computeBalances({
      amount: invoice.amount,
      received,
      currency: invoice.currency,
      shortfallToleranceBps: invoice.shortfallToleranceBps,
      currentStatus: invoice.status,
    });
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        amountReceived: balances.amountReceived,
        amountOutstanding: balances.amountOutstanding,
        amountOverpaid: balances.amountOverpaid,
        status: balances.status,
      },
    });
  }
}
