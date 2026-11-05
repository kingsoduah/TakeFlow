import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { IsDecimalAmount } from '../../common/validators/is-decimal-amount.js';
import { ACCEPTED_PAIRS_TEXT, PRICE_CURRENCIES } from '../../pricing/catalog.js';
import { IsAcceptedPaymentPair, IsPriceCurrency } from '../../pricing/validators.js';

export class CreateInvoiceDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Client in the same business; must exist',
  })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({
    example: 'INV-20261104-0001',
    maxLength: 40,
    description: 'Auto-generated as INV-YYYYMMDD-XXXX when omitted',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  invoiceNumber?: string;

  @ApiPropertyOptional({ example: 'Landing page design', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  description?: string;

  @ApiProperty({
    example: '1500.00',
    description: 'Decimal string or number, max 18 decimal places',
    type: String,
  })
  @IsDecimalAmount(18)
  amount!: string | number;

  @ApiProperty({
    example: 'GBP',
    enum: PRICE_CURRENCIES,
    description: 'Price currency. Payers still pay in crypto, converted at a quoted rate.',
  })
  @IsPriceCurrency()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency!: string;

  @ApiProperty({ example: 'USDT', enum: ['USDT', 'USDC'] })
  @Matches(/^[A-Z0-9]{2,20}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  cryptoAsset!: string;

  @ApiProperty({
    example: 'trc20',
    enum: ['trc20', 'bep20', 'base'],
    description: `Roqqu network code. Accepted pairs: ${ACCEPTED_PAIRS_TEXT}`,
  })
  @Matches(/^[a-z0-9]{2,20}$/)
  @IsAcceptedPaymentPair()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  network!: string;

  @ApiProperty({ example: '2026-12-31T00:00:00.000Z', format: 'date-time' })
  @IsISO8601()
  dueDate!: string;

  @ApiPropertyOptional({
    enum: InvoiceStatus,
    default: InvoiceStatus.DRAFT,
    description:
      'PAID and PARTIALLY_PAID are written only by payment reconciliation',
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}
