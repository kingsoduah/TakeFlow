import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsDecimalAmount } from '../../common/validators/is-decimal-amount.js';

export class UpdateInvoiceDto {
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @IsUUID()
  clientId?: string | null;

  @ApiPropertyOptional({ example: 'INV-20261104-0001', maxLength: 40 })
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

  @ApiPropertyOptional({
    example: '1750.00',
    description: 'Decimal string or number, max 18 decimal places',
    type: String,
  })
  @IsOptional()
  @IsDecimalAmount(18)
  amount?: string | number;

  @ApiPropertyOptional({ example: '2026-12-31T00:00:00.000Z', format: 'date-time' })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional({
    enum: InvoiceStatus,
    description:
      'PAID and PARTIALLY_PAID are rejected; payment status comes from reconciliation',
  })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;
}
