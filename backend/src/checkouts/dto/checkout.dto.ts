import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceStatus, ValuationMethod } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsDecimalAmount } from '../../common/validators/is-decimal-amount.js';
import { ACCEPTED_PAIRS_TEXT, PRICE_CURRENCIES } from '../../pricing/catalog.js';
import { IsAcceptedPaymentPair, IsPriceCurrency } from '../../pricing/validators.js';
import {
  DEFAULT_CHECKOUT_EXPIRY_MINUTES,
  MAX_CHECKOUT_EXPIRY_MINUTES,
  MIN_CHECKOUT_EXPIRY_MINUTES,
} from '../checkout-rules.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const upper = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toUpperCase() : value;
const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

// Fields shared by checkouts and product links: the price and how it is paid.
export class PriceFieldsDto {
  @ApiProperty({ example: '25000', description: 'Price, decimal string or number', type: String })
  @IsDecimalAmount(18)
  amount!: string | number;

  @ApiProperty({ example: 'NGN', enum: PRICE_CURRENCIES })
  @Transform(upper)
  @IsPriceCurrency()
  currency!: string;

  @ApiProperty({ example: 'USDT', enum: ['USDT', 'USDC'] })
  @Transform(upper)
  @Matches(/^[A-Z0-9]{2,20}$/)
  cryptoAsset!: string;

  @ApiProperty({
    example: 'trc20',
    enum: ['trc20', 'bep20', 'base'],
    description: `Accepted pairs: ${ACCEPTED_PAIRS_TEXT}`,
  })
  @Transform(lower)
  @Matches(/^[a-z0-9]{2,20}$/)
  @IsAcceptedPaymentPair()
  network!: string;

  @ApiPropertyOptional({
    example: 'https://shop.example/orders/1042/thanks',
    maxLength: 2048,
    description: 'Where the "back to shop" button goes after payment. Not proof of payment.',
  })
  @IsOptional()
  @Transform(trim)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  @MaxLength(2048)
  returnUrl?: string;
}

export class CreateCheckoutDto extends PriceFieldsDto {
  @ApiPropertyOptional({ example: 'Order #1042: 2 tote bags', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @Transform(trim)
  description?: string;

  @ApiPropertyOptional({
    example: '1042',
    maxLength: 100,
    description:
      "The shop's own order id. Sending the same orderId again returns the same checkout (409 if the price differs).",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(trim)
  orderId?: string;

  @ApiPropertyOptional({ example: 'Chidi Okafor', maxLength: 120 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(trim)
  buyerName?: string;

  @ApiPropertyOptional({ example: 'chidi@example.com', maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(lower)
  buyerEmail?: string;

  @ApiPropertyOptional({
    example: DEFAULT_CHECKOUT_EXPIRY_MINUTES,
    minimum: MIN_CHECKOUT_EXPIRY_MINUTES,
    maximum: MAX_CHECKOUT_EXPIRY_MINUTES,
    default: DEFAULT_CHECKOUT_EXPIRY_MINUTES,
    description: 'Minutes until an unpaid link stops working (default 24 hours)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(MIN_CHECKOUT_EXPIRY_MINUTES)
  @Max(MAX_CHECKOUT_EXPIRY_MINUTES)
  expiresInMinutes?: number;
}

export class ListCheckoutsQueryDto {
  @ApiPropertyOptional({ enum: InvoiceStatus })
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only checkouts started from this product link' })
  @IsOptional()
  @IsUUID()
  productLinkId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 50;

  @ApiPropertyOptional({ minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

export class CheckoutPaymentDto {
  @ApiProperty({ example: '0x9c1f...e42b' })
  transactionHash!: string;

  @ApiProperty({ example: 'USDT' })
  asset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiProperty({ example: '18.19', description: 'Crypto received' })
  amount!: string;

  @ApiPropertyOptional({ example: '25011.25', nullable: true, description: 'Value in the price currency' })
  valueAmount!: string | null;

  @ApiPropertyOptional({ example: 'NGN', nullable: true })
  valueCurrency!: string | null;

  @ApiPropertyOptional({ example: '1375', nullable: true, description: 'Price currency per 1 coin' })
  valuationRate!: string | null;

  @ApiPropertyOptional({ enum: ValuationMethod, nullable: true })
  valuationMethod!: ValuationMethod | null;

  @ApiPropertyOptional({ nullable: true })
  depositedAt!: Date | null;

  @ApiProperty()
  receivedAt!: Date;
}

export class CheckoutDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    example: 'pay_9f2c1d7a4b8e0f1a2b3c4d5e6f708192',
    description: 'Public reference for the payment page and GET /pay/:reference',
  })
  paymentReference!: string;

  @ApiProperty({ example: 'CHK-20261105-1A2B3C4D' })
  invoiceNumber!: string;

  @ApiProperty({ enum: InvoiceStatus, description: 'PAID only once the full amount (within tolerance) is in' })
  status!: InvoiceStatus;

  @ApiProperty({ example: '25000' })
  amount!: string;

  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: '0' })
  amountReceived!: string;

  @ApiProperty({ example: '25000', description: 'How much is missing' })
  amountOutstanding!: string;

  @ApiProperty({ example: '0' })
  amountOverpaid!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiPropertyOptional({ nullable: true, description: 'Set once the payer asks to pay' })
  paymentAddress!: string | null;

  @ApiPropertyOptional({ example: '1042', nullable: true })
  orderId!: string | null;

  @ApiPropertyOptional({ nullable: true })
  description!: string | null;

  @ApiPropertyOptional({ nullable: true })
  buyerName!: string | null;

  @ApiPropertyOptional({ nullable: true })
  buyerEmail!: string | null;

  @ApiPropertyOptional({ nullable: true })
  returnUrl!: string | null;

  @ApiPropertyOptional({ nullable: true })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Product link it was started from' })
  productLinkId!: string | null;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}

export class CheckoutDetailDto extends CheckoutDto {
  @ApiProperty({ type: [CheckoutPaymentDto] })
  payments!: CheckoutPaymentDto[];
}

export class CheckoutListDto {
  @ApiProperty({ type: [CheckoutDto] })
  data!: CheckoutDto[];

  @ApiProperty({ example: 12 })
  total!: number;

  @ApiProperty({ example: 50 })
  limit!: number;

  @ApiProperty({ example: 0 })
  offset!: number;
}
