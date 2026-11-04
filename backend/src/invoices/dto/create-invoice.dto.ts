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

  @ApiProperty({ example: 'USD', pattern: '^[A-Z]{3}$' })
  @Matches(/^[A-Z]{3}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  currency!: string;

  @ApiProperty({ example: 'USDT', pattern: '^[A-Z0-9]{2,20}$' })
  @Matches(/^[A-Z0-9]{2,20}$/)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  cryptoAsset!: string;

  @ApiProperty({
    example: 'erc20',
    pattern: '^[a-z0-9]{2,20}$',
    description: 'Roqqu network code used for wallet generation and matching',
  })
  @Matches(/^[a-z0-9]{2,20}$/)
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
