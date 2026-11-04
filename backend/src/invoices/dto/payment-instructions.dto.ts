import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';

export class InvoiceClientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Paystack Nigeria' })
  name!: string;

  @ApiPropertyOptional({ example: 'payables@client.example', nullable: true })
  email?: string | null;
}

export class PaymentInstructionsDto {
  @ApiProperty({ example: 'Acme Studios' })
  businessName!: string;

  @ApiProperty({ format: 'uuid' })
  invoiceId!: string;

  @ApiProperty({ example: 'INV-20261104-0001' })
  invoiceNumber!: string;

  @ApiProperty({
    example: 'tf_9f2c1d7a4b8e',
    description: 'Stable payment reference for the invoice',
  })
  paymentReference!: string;

  @ApiPropertyOptional({ example: 'Landing page design', nullable: true })
  description?: string | null;

  @ApiProperty({ example: '1500', description: 'Decimal amount, as a string' })
  amount!: string;

  @ApiProperty({ example: 'USD' })
  currency!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'erc20' })
  network!: string;

  @ApiPropertyOptional({
    example: '0x8f3c...d91a',
    nullable: true,
    description: 'Null until POST /invoices/:id/address has been called',
  })
  address?: string | null;

  @ApiProperty({
    example: true,
    description: 'False when the invoice still needs a receiving address',
  })
  paymentReady!: boolean;

  @ApiProperty({ enum: InvoiceStatus, example: InvoiceStatus.PENDING })
  status!: InvoiceStatus;

  @ApiProperty({ example: '0' })
  amountReceived!: string;

  @ApiProperty({ example: '1500' })
  amountOutstanding!: string;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z', nullable: true })
  dueDate?: Date | null;

  @ApiPropertyOptional({ type: InvoiceClientDto, nullable: true })
  client?: InvoiceClientDto | null;
}
