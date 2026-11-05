import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PriceFieldsDto } from './checkout.dto.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateProductLinkDto extends PriceFieldsDto {
  @ApiProperty({ example: 'Ankara tote bag', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trim)
  title!: string;

  @ApiPropertyOptional({ example: 'Handmade in Lagos', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;
}

// Every field is optional. A changed price applies to new buyers only;
// checkouts already started keep their own price.
export class UpdateProductLinkDto extends PartialType(CreateProductLinkDto) {
  @ApiPropertyOptional({ example: false, description: 'false turns the link off' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class ProductLinkDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'link_0f1e2d3c4b5a69788796a5b4c3d2e1f0',
    description: 'Public reference for GET /pay/links/:reference',
  })
  reference!: string;

  @ApiProperty({ example: 'Ankara tote bag' })
  title!: string;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiProperty({ example: '5000' })
  amount!: string;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiPropertyOptional({ nullable: true })
  returnUrl!: string | null;

  @ApiProperty({ example: true })
  active!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
