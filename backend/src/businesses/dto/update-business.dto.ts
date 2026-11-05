import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateBusinessDto {
  @ApiPropertyOptional({ example: 'Acme Studios Ltd', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  businessName?: string;

  @ApiPropertyOptional({
    example: 'billing@acme.example',
    maxLength: 254,
    format: 'email',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  businessEmail?: string;

  @ApiPropertyOptional({ example: 'agency', maxLength: 60 })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  businessType?: string;

  @ApiPropertyOptional({
    example: 5,
    minimum: 2,
    maximum: 5,
    default: 5,
    description: 'How many minutes a payment quote holds its crypto amount',
  })
  // Absent is fine; null is rejected (the column cannot be empty).
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(2)
  @Max(5)
  quoteWindowMinutes?: number;

  @ApiPropertyOptional({
    example: 50,
    minimum: 0,
    maximum: 500,
    default: 50,
    description:
      'Shortfall that still counts as paid, in basis points of the price (50 = 0.5%, 0 = exact). Applies to invoices and checkouts created after the change.',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(500)
  shortfallToleranceBps?: number;
}
