import { ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceKind } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional } from 'class-validator';
import { PRICE_CURRENCIES } from '../../pricing/catalog.js';
import { IsPriceCurrency } from '../../pricing/validators.js';

export class SummaryQueryDto {
  @ApiPropertyOptional({
    enum: PRICE_CURRENCIES,
    description: 'Show totals in this currency instead of the saved display currency',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsPriceCurrency()
  currency?: string;

  @ApiPropertyOptional({ enum: InvoiceKind, description: 'Only invoices or only checkouts' })
  @IsOptional()
  @IsEnum(InvoiceKind)
  kind?: InvoiceKind;
}
