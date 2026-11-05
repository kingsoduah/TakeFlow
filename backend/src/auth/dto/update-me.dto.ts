import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { PRICE_CURRENCIES } from '../../pricing/catalog.js';
import { IsPriceCurrency } from '../../pricing/validators.js';

export class UpdateMeDto {
  @ApiPropertyOptional({
    enum: PRICE_CURRENCIES,
    example: 'NGN',
    description: 'Personal dashboard currency. Changes only what this user sees.',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsPriceCurrency()
  displayCurrency?: string;
}
