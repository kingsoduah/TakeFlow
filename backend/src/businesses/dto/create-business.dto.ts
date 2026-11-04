import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty({ example: 'Acme Studios', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  businessName!: string;

  @ApiPropertyOptional({
    example: 'billing@acme.example',
    maxLength: 254,
    format: 'email',
    description: 'Also used as the fallback customer email for Roqqu wallets',
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
}
