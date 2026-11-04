import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

export class InvoiceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  businessId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  clientId?: string | null;

  @ApiProperty({ example: 'INV-20261104-0001' })
  invoiceNumber!: string;

  @ApiProperty({ example: 'tf_9f2c1d7a4b8e' })
  paymentReference!: string;

  @ApiPropertyOptional({ example: 'Landing page design', nullable: true })
  description?: string | null;

  @ApiProperty({ example: '1500', description: 'Decimal string' })
  amount!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'erc20' })
  network!: string;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  issueDate!: Date;

  @ApiProperty({ example: '2026-12-31T00:00:00.000Z' })
  dueDate!: Date;

  @ApiPropertyOptional({
    example: '0x8f3c...d91a',
    nullable: true,
    description: 'Receiving address assigned via POST /invoices/:id/address',
  })
  paymentAddress?: string | null;

  @ApiProperty({ enum: InvoiceStatus, example: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @ApiProperty({ example: '500' })
  amountReceived!: string;

  @ApiProperty({ example: '1000' })
  amountOutstanding!: string;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Client summary when the invoice has a client',
    example: { id: '3f1e...', name: 'Paystack Nigeria', email: 'pay@client.example' },
  })
  client?: Record<string, unknown> | null;
}

export class InvoiceListDto {
  @ApiProperty({ type: [InvoiceDto] })
  data!: InvoiceDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}
