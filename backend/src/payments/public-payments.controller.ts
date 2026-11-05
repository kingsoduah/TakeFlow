import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { RateLimit, RateLimitGuard } from '../common/rate-limit/rate-limit.js';
import {
  PaymentOptionsDto,
  PublicPaymentDto,
  PublicPaymentQueryDto,
  PublicProductLinkDto,
  StartProductCheckoutDto,
} from './dto/public-payment.dto.js';
import { PublicPaymentsService } from './public-payments.service.js';

// Per client address. A payment page polling every 5 seconds uses 12 reads
// a minute, well inside the read limit.
export const PUBLIC_READ_LIMIT = { bucket: 'public-read', limit: 120, windowMs: 60_000 };
export const PUBLIC_QUOTE_LIMIT = { bucket: 'public-quote', limit: 20, windowMs: 60_000 };
// Each started checkout makes a Roqqu address, so this one is tight.
export const PUBLIC_CHECKOUT_START_LIMIT = {
  bucket: 'public-checkout-start',
  limit: 10,
  windowMs: 10 * 60_000,
};

// Public routes: no JWT. The paymentReference (pay_ plus 32 random hex
// characters) is the only key, and every route is rate limited per client.
@ApiTags('public payments')
@Controller('pay')
@UseGuards(RateLimitGuard)
@ApiResponse({ status: 429, description: 'Too many requests from this client', type: ApiErrorDto })
export class PublicPaymentsController {
  constructor(private readonly payments: PublicPaymentsService) {}

  // Declared before :reference so "options" is not read as a reference.
  @Get('options')
  @RateLimit(PUBLIC_READ_LIMIT)
  @ApiOperation({ summary: 'Accepted price currencies and coin/network pairs (public)' })
  @ApiOkResponse({ type: PaymentOptionsDto })
  options() {
    return this.payments.options();
  }

  @Get('links/:reference')
  @RateLimit(PUBLIC_READ_LIMIT)
  @ApiOperation({
    summary: 'Product link page data (public)',
    description:
      'The product, its price and an indicative crypto amount at the latest rate (not held). ' +
      'active is false once the shop turns the link off.',
  })
  @ApiParam({ name: 'reference', example: 'link_0f1e2d3c4b5a69788796a5b4c3d2e1f0' })
  @ApiOkResponse({ type: PublicProductLinkDto })
  @ApiResponse({ status: 404, description: 'Unknown link', type: ApiErrorDto })
  getProductLink(@Param('reference') reference: string) {
    return this.payments.getProductLink(reference);
  }

  @Post('links/:reference/checkouts')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit(PUBLIC_CHECKOUT_START_LIMIT)
  @ApiOperation({
    summary: 'Buyer taps Pay on a product link (public)',
    description:
      "Starts this buyer's own checkout with its own address, quote and status, and returns " +
      'its payment page data. Use paymentReference from the response for later reads and ' +
      'quotes. buyerName and buyerEmail are optional.',
  })
  @ApiParam({ name: 'reference', example: 'link_0f1e2d3c4b5a69788796a5b4c3d2e1f0' })
  @ApiCreatedResponse({ type: PublicPaymentDto })
  @ApiResponse({ status: 404, description: 'Unknown link', type: ApiErrorDto })
  @ApiResponse({ status: 410, description: 'The shop turned the link off', type: ApiErrorDto })
  @ApiResponse({ status: 502, description: 'Roqqu could not create the address', type: ApiErrorDto })
  @ApiResponse({ status: 503, description: 'Price unavailable', type: ApiErrorDto })
  startProductCheckout(
    @Param('reference') reference: string,
    @Body() dto: StartProductCheckoutDto,
    @Query() query: PublicPaymentQueryDto,
  ) {
    return this.payments.startProductLinkCheckout(reference, dto, query.currency);
  }

  @Get(':reference')
  @RateLimit(PUBLIC_READ_LIMIT)
  @ApiOperation({
    summary: 'Payment page data (public)',
    description:
      'Business name, what is being paid for, price, amount owed, coin and network, address, ' +
      'the active quote with its expiry and rate time, status and payments so far. Read only: ' +
      'it never creates a quote or an address. Add ?currency= to see the amounts in another ' +
      'currency, for display only.',
  })
  @ApiParam({ name: 'reference', example: 'pay_9f2c1d7a4b8e0f1a2b3c4d5e6f708192' })
  @ApiOkResponse({ type: PublicPaymentDto })
  @ApiResponse({ status: 404, description: 'Unknown reference or a draft invoice', type: ApiErrorDto })
  getPayment(@Param('reference') reference: string, @Query() query: PublicPaymentQueryDto) {
    return this.payments.getPayment(reference, query.currency);
  }

  @Post(':reference/quote')
  @HttpCode(HttpStatus.OK)
  @RateLimit(PUBLIC_QUOTE_LIMIT)
  @ApiOperation({
    summary: 'Get the active quote or a fresh one (public)',
    description:
      'Returns the payment page data with an active quote. Reuses the running quote while it ' +
      'still matches the amount owed; otherwise makes a new one for the business window (2 to ' +
      '5 minutes). Creates the receiving address on first use. Call again when the countdown ' +
      'ends.',
  })
  @ApiParam({ name: 'reference', example: 'pay_9f2c1d7a4b8e0f1a2b3c4d5e6f708192' })
  @ApiOkResponse({ type: PublicPaymentDto })
  @ApiResponse({ status: 404, description: 'Unknown reference or a draft invoice', type: ApiErrorDto })
  @ApiResponse({ status: 409, description: 'Already paid, or nothing is owed', type: ApiErrorDto })
  @ApiResponse({ status: 410, description: 'The checkout link has expired', type: ApiErrorDto })
  @ApiResponse({ status: 502, description: 'Roqqu could not create the address', type: ApiErrorDto })
  @ApiResponse({
    status: 503,
    description: 'Price unavailable: no good rate snapshot from the last 30 minutes',
    type: ApiErrorDto,
  })
  requestQuote(@Param('reference') reference: string, @Query() query: PublicPaymentQueryDto) {
    return this.payments.requestQuote(reference, query.currency);
  }
}
