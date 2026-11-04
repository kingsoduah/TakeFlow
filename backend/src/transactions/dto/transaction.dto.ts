import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, ReconciliationStatus } from '@prisma/client';

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

  @ApiProperty({ example: '500', description: 'Verified deposit amount' })
  amount!: string;

  @ApiProperty({
    example: '0',
    description: 'Amount above the invoice total, tracked separately',
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

export class BusinessSummaryDto {
  @ApiProperty({ example: '4500' })
  totalInvoiced!: string;

  @ApiProperty({ example: '1500' })
  totalReceived!: string;

  @ApiProperty({ example: '3000' })
  totalOutstanding!: string;

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

  @ApiProperty({ type: [TransactionDto] })
  recentTransactions!: TransactionDto[];
}
