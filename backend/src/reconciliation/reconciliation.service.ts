import { Injectable } from '@nestjs/common';
import { InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

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
}

export interface ReconcileResult {
  status: 'matched' | 'unmatched' | 'duplicate';
  transactionId: string;
  invoiceId: string | null;
}

// Matches a VERIFIED deposit to an invoice and updates balances. All money
// uses Prisma.Decimal. Reconciliation is idempotent: invoice balances are
// recomputed from the sum of matched transactions, so redeliveries converge
// instead of double-crediting. No interactive DB transactions are used (the
// Neon serverless adapter does not support them); uniqueness constraints on
// transactionHash make concurrent inserts safe.
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async reconcileVerifiedDeposit(deposit: VerifiedDeposit): Promise<ReconcileResult> {
    const existing = await this.prisma.transaction.findUnique({
      where: { transactionHash: deposit.transactionHash },
    });
    if (existing) {
      if (existing.reconciliationStatus === ReconciliationStatus.MATCHED) {
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
        },
      });
      return { status: 'unmatched', transactionId: unmatched.id, invoiceId: null };
    }

    const matchedSum = await this.sumMatched(invoice.id);
    const newReceived = matchedSum.plus(deposit.amount);
    const excess = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      newReceived.minus(invoice.amount),
    );

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
      },
    });

    await this.recomputeInvoice(invoice.id);
    return { status: 'matched', transactionId: transaction.id, invoiceId: invoice.id };
  }

  private async sumMatched(invoiceId: string): Promise<Prisma.Decimal> {
    const result = await this.prisma.transaction.aggregate({
      where: { invoiceId, reconciliationStatus: ReconciliationStatus.MATCHED },
      _sum: { amount: true },
    });
    return result._sum.amount ?? new Prisma.Decimal(0);
  }

  // Recomputes an invoice from its matched transactions. Safe to run any
  // number of times with the same result.
  async recomputeInvoice(invoiceId: string | null): Promise<void> {
    if (!invoiceId) return;
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
    });
    if (!invoice) return;
    const received = await this.sumMatched(invoiceId);
    const outstanding = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      invoice.amount.minus(received),
    );
    const status =
      received.greaterThanOrEqualTo(invoice.amount) &&
      received.greaterThan(0)
        ? InvoiceStatus.PAID
        : received.greaterThan(0)
          ? InvoiceStatus.PARTIALLY_PAID
          : invoice.status;
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: { amountReceived: received, amountOutstanding: outstanding, status },
    });
  }
}
