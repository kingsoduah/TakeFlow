import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InvoiceKind, InvoiceStatus, ValuationMethod } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PRICE_CURRENCIES } from '../../pricing/catalog.js';
import { IsPriceCurrency } from '../../pricing/validators.js';

export class PublicQuoteDto {
  @ApiProperty({ example: '1333.34', description: 'Crypto to send, rounded up to the coin precision' })
  cryptoAmount!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiProperty({ example: 'GBP' })
  priceCurrency!: string;

  @ApiProperty({ example: '1000', description: 'Amount owed in the price currency when quoted' })
  amountDue!: string;

  @ApiProperty({ example: '0.75', description: 'Price currency per 1 coin' })
  rate!: string;

  @ApiProperty({
    example: '2026-11-05T14:28:00.000Z',
    description:
      'When the rates behind this quote were fetched from Roqqu. Can be up to 30 minutes old when the feeds are down; show it as "rate from HH:MM".',
  })
  rateFetchedAt!: Date;

  @ApiProperty({ example: '2026-11-05T15:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-05T15:05:00.000Z', description: 'Countdown end' })
  expiresAt!: Date;
}

export class PublicPaymentRecordDto {
  @ApiProperty({ example: '0x9c1f...e42b' })
  transactionHash!: string;

  @ApiProperty({ example: 'USDT' })
  asset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiProperty({ example: '600', description: 'Crypto received' })
  amount!: string;

  @ApiPropertyOptional({
    example: '450',
    nullable: true,
    description: 'Value in the price currency; null while waiting for a rate',
  })
  valueAmount!: string | null;

  @ApiPropertyOptional({ example: 'GBP', nullable: true })
  valueCurrency!: string | null;

  @ApiPropertyOptional({ enum: ValuationMethod, nullable: true })
  valuationMethod!: ValuationMethod | null;

  @ApiPropertyOptional({ example: '2026-11-05T15:01:10.000Z', nullable: true })
  depositedAt!: Date | null;

  @ApiProperty({ example: '2026-11-05T15:01:30.000Z', description: 'When TakeFlow recorded it' })
  receivedAt!: Date;
}

export class PublicDisplayAmountsDto {
  @ApiProperty({ example: 'NGN' })
  currency!: string;

  @ApiProperty({ example: '1833333.33' })
  amount!: string;

  @ApiProperty({ example: '0' })
  amountReceived!: string;

  @ApiProperty({ example: '1833333.33' })
  amountOutstanding!: string;

  @ApiPropertyOptional({
    example: '2026-11-05T14:28:00.000Z',
    nullable: true,
    description: 'Time of the rate used; null when no conversion was needed',
  })
  rateFetchedAt!: Date | null;
}

export class PublicPaymentDto {
  @ApiProperty({ enum: InvoiceKind })
  kind!: InvoiceKind;

  @ApiProperty({ example: 'pay_9f2c1d7a4b8e0f1a2b3c4d5e6f708192' })
  paymentReference!: string;

  @ApiProperty({ example: 'Acme Studios' })
  businessName!: string;

  @ApiProperty({ example: 'INV-20261105-1A2B', description: 'Invoice or checkout number' })
  invoiceNumber!: string;

  @ApiPropertyOptional({ example: 'Landing page design', nullable: true })
  description!: string | null;

  @ApiProperty({ example: '1000', description: 'Price in the price currency' })
  amount!: string;

  @ApiProperty({ example: 'GBP', enum: PRICE_CURRENCIES })
  currency!: string;

  @ApiProperty({ example: '450' })
  amountReceived!: string;

  @ApiProperty({ example: '550', description: 'Still owed; zero once it counts as paid' })
  amountOutstanding!: string;

  @ApiProperty({ example: '0', description: 'Reported overpayment, in the price currency' })
  amountOverpaid!: string;

  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;

  @ApiPropertyOptional({
    example: 'TXyz...abc',
    nullable: true,
    description: 'Null until the first quote is requested',
  })
  address!: string | null;

  @ApiProperty({ enum: InvoiceStatus })
  status!: InvoiceStatus;

  @ApiProperty({
    example: true,
    description: 'True when POST /pay/:reference/quote can give a quote right now',
  })
  payable!: boolean;

  @ApiPropertyOptional({ nullable: true, description: 'Invoices only' })
  dueDate!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Checkouts only: when an unpaid link stops working' })
  expiresAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Checkouts only: the "back to shop" link' })
  returnUrl!: string | null;

  @ApiPropertyOptional({ type: PublicQuoteDto, nullable: true, description: 'The active quote' })
  quote!: PublicQuoteDto | null;

  @ApiProperty({ type: [PublicPaymentRecordDto] })
  payments!: PublicPaymentRecordDto[];

  @ApiPropertyOptional({
    type: PublicDisplayAmountsDto,
    nullable: true,
    description:
      'Only with ?currency=: the amounts converted at the latest rate, for display. What is owed stays in the price currency.',
  })
  display!: PublicDisplayAmountsDto | null;

  @ApiProperty({ description: 'Server clock, to keep the countdown in step' })
  serverTime!: Date;
}

export class PublicPaymentQueryDto {
  @ApiPropertyOptional({ enum: PRICE_CURRENCIES, description: 'Display currency for the payer' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsPriceCurrency()
  currency?: string;
}

// A blank form field counts as skipped, so the shop details are used.
function blankToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

export class StartProductCheckoutDto {
  @ApiPropertyOptional({
    example: 'Chidi Okafor',
    maxLength: 120,
    description: 'Optional. The shop name is used when left out.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(blankToUndefined)
  buyerName?: string;

  @ApiPropertyOptional({
    example: 'chidi@example.com',
    maxLength: 254,
    description: 'Optional. The shop email is used when left out.',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => {
    const trimmed = blankToUndefined({ value });
    return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
  })
  buyerEmail?: string;
}

export class IndicativePriceDto {
  @ApiProperty({ example: '3.64', description: 'Crypto at the latest rate; not held until Pay is tapped' })
  cryptoAmount!: string;

  @ApiProperty({ example: '1375' })
  rate!: string;

  @ApiProperty({ example: '2026-11-05T14:28:00.000Z' })
  rateFetchedAt!: Date;
}

export class PublicProductLinkDto {
  @ApiProperty({ example: 'link_0f1e2d3c4b5a69788796a5b4c3d2e1f0' })
  reference!: string;

  @ApiProperty({ example: 'Acme Store' })
  businessName!: string;

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

  @ApiProperty({ example: true, description: 'False once the shop turns the link off' })
  active!: boolean;

  @ApiPropertyOptional({ type: IndicativePriceDto, nullable: true, description: 'Null when no rate is available' })
  indicative!: IndicativePriceDto | null;
}

export class PaymentPairDto {
  @ApiProperty({ example: 'USDT' })
  cryptoAsset!: string;

  @ApiProperty({ example: 'trc20' })
  network!: string;
}

export class PaymentOptionsDto {
  @ApiProperty({ example: PRICE_CURRENCIES, type: [String] })
  currencies!: string[];

  @ApiProperty({ type: [PaymentPairDto] })
  paymentPairs!: PaymentPairDto[];
}
