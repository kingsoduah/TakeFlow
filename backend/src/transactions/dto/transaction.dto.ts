import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, ReconciliationStatus, ValuationMethod } from '@prisma/client';

export class TransactionInvoiceRefDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'INV-20261104-0001' })
  invoiceNumber!: string;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;
}

export class TransactionDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  businessId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  invoiceId?: string | null;

  @ApiProperty({ example: '0x9c1f...e42b' })
  transactionHash!: string;

  @ApiProperty({ example: '0x8f3c...d91a' })
  receivingAddress!: string;

  @ApiPropertyOptional({ example: '0x2a77...b103', nullable: true })
  senderAddress?: string | null;

  @ApiProperty({ example: 'USDT' })
  asset!: string;

  @ApiProperty({ example: 'erc20' })
  network!: string;

  @ApiProperty({ example: '500', description: 'Verified deposit amount, in crypto' })
  amount!: string;

  @ApiProperty({
    example: '0',
    description:
      'Overpayment this payment added, in the price currency (zero under one minor unit)',
  })
  excessAmount!: string;

  @ApiPropertyOptional({ example: '4829', nullable: true })
  providerReference?: string | null;

  @ApiPropertyOptional({
    example: 1,
    nullable: true,
    description: 'Raw Roqqu numeric status; recorded but never interpreted',
  })
  providerStatus?: number | null;

  @ApiProperty({ enum: ReconciliationStatus })
  reconciliationStatus!: ReconciliationStatus;

  @ApiPropertyOptional({
    example: '2026-11-04T12:00:00.000Z',
    nullable: true,
    description: 'On-chain/event time when supplied by Roqqu',
  })
  occurredAt?: Date | null;

  @ApiPropertyOptional({
    example: '2026-11-05T15:01:10.000Z',
    nullable: true,
    description: 'Deposit time used for the quote window (Roqqu created_at, else webhook datetime)',
  })
  depositedAt?: Date | null;

  @ApiPropertyOptional({ example: 'GBP', nullable: true, description: 'Price currency of the value' })
  valueCurrency?: string | null;

  @ApiPropertyOptional({
    example: '450',
    nullable: true,
    description: 'Value in the price currency, set once at first match; null while waiting for a rate',
  })
  valueAmount?: string | null;

  @ApiPropertyOptional({ example: '0.75', nullable: true, description: 'Price currency per 1 coin' })
  valuationRate?: string | null;

  @ApiPropertyOptional({ enum: ValuationMethod, nullable: true })
  valuationMethod?: ValuationMethod | null;

  @ApiPropertyOptional({ example: '2026-11-05T15:01:30.000Z', nullable: true })
  valuedAt?: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Rate snapshot used' })
  rateSnapshotId?: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Quote that applied, if any' })
  quoteId?: string | null;

  @ApiProperty({ example: '2026-11-04T12:00:05.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-04T12:00:05.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    type: TransactionInvoiceRefDto,
    nullable: true,
    description: 'Present when the deposit matched an invoice',
  })
  invoice?: TransactionInvoiceRefDto | null;
}

export class TransactionListDto {
  @ApiProperty({ type: [TransactionDto] })
  data!: TransactionDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}

export class InvoicePaymentsDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'The invoice with its client summary and computed balances',
    example: {
      id: '3f1e...',
      invoiceNumber: 'INV-20261104-0001',
      amount: '1500',
      amountReceived: '500',
      amountOutstanding: '1000',
      status: 'PARTIALLY_PAID',
    },
  })
  invoice!: Record<string, unknown>;

  @ApiProperty({ type: [TransactionDto] })
  transactions!: TransactionDto[];

  @ApiProperty({ example: '500' })
  totalReceived!: string;

  @ApiProperty({ example: '1000' })
  amountOutstanding!: string;

  @ApiProperty({ example: 1 })
  paymentCount!: number;
}

export class CurrencyTotalsDto {
  @ApiProperty({ example: 'GBP' })
  currency!: string;

  @ApiProperty({ example: 3 })
  invoiceCount!: number;

  @ApiProperty({ example: '4500', description: 'In this currency, not converted' })
  totalInvoiced!: string;

  @ApiProperty({ example: '1500' })
  totalReceived!: string;

  @ApiProperty({ example: '3000' })
  totalOutstanding!: string;

  @ApiProperty({ example: '0' })
  totalOverpaid!: string;
}

export class BusinessSummaryDto {
  @ApiProperty({
    example: 'NGN',
    description: 'Currency of the three totals below: ?currency=, else the saved display currency',
  })
  displayCurrency!: string;

  @ApiPropertyOptional({
    example: '8250000.00',
    nullable: true,
    description: 'Converted at the latest rate. Null when a needed rate is unavailable.',
  })
  totalInvoiced!: string | null;

  @ApiPropertyOptional({
    example: '2062500.00',
    nullable: true,
    description: 'Each payment converted at the snapshot it was valued with',
  })
  totalReceived!: string | null;

  @ApiPropertyOptional({ example: '6187500.00', nullable: true })
  totalOutstanding!: string | null;

  @ApiPropertyOptional({
    example: '2026-11-05T14:28:00.000Z',
    nullable: true,
    description: 'Time of the latest rate used; null when nothing needed converting',
  })
  ratesAsOf!: Date | null;

  @ApiProperty({
    type: [CurrencyTotalsDto],
    description: 'Totals per price currency. Drafts and expired links are left out.',
  })
  byCurrency!: CurrencyTotalsDto[];

  @ApiProperty({
    description: 'Invoice counts keyed by every InvoiceStatus value',
    example: {
      DRAFT: 1,
      PENDING: 2,
      PARTIALLY_PAID: 1,
      PAID: 3,
      OVERDUE: 0,
      EXPIRED: 0,
    },
    type: 'object',
    additionalProperties: { type: 'integer' },
  })
  invoiceCountByStatus!: Record<string, number>;

  @ApiProperty({
    example: 2,
    description: 'Deposits that could not be matched to an invoice',
  })
  unmatchedTransactionCount!: number;

  @ApiProperty({
    example: 0,
    description: 'Matched payments still waiting for a rate to be valued',
  })
  unvaluedPaymentCount!: number;

  @ApiProperty({ type: [TransactionDto] })
  recentTransactions!: TransactionDto[];
}
