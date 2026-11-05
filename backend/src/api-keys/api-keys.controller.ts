import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CheckoutsService, toCheckoutView } from '../checkouts/checkouts.service.js';
import { CheckoutDetailDto, CheckoutDto, CreateCheckoutDto } from '../checkouts/dto/checkout.dto.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { RateLimit, RateLimitGuard } from '../common/rate-limit/rate-limit.js';
import { ApiKeyBusiness, ApiKeyGuard } from './api-key.guard.js';
import { ApiKeysService } from './api-keys.service.js';
import { ApiKeyDto, CreateApiKeyDto, CreatedApiKeyDto } from './dto/api-key.dto.js';

// Managing keys needs the owner's login (JWT).
@ApiTags('api keys')
@ApiCommonErrors()
@Controller('businesses/:businessId/api-keys')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post()
  @ApiOperation({ summary: 'Create a website API key (the full key is shown once)' })
  @ApiCreatedResponse({ type: CreatedApiKeyDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateApiKeyDto,
  ) {
    return this.apiKeys.create(ownerId, businessId, dto.name);
  }

  @Get()
  @ApiOkResponse({ type: [ApiKeyDto], description: 'Keys without their secret part' })
  list(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.apiKeys.list(ownerId, businessId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a key. Calls with it fail from then on.' })
  async revoke(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.apiKeys.revoke(ownerId, businessId, id);
  }
}

export const CHECKOUT_API_LIMIT = { bucket: 'checkout-api', limit: 120, windowMs: 60_000 };

// Called by a shop's server with its API key in X-Api-Key. The key decides
// the business. The shop confirms an order is paid by reading the status
// here, never from the buyer's return URL redirect.
@ApiTags('checkout api')
@ApiSecurity('api-key')
@Controller('checkouts')
@UseGuards(RateLimitGuard, ApiKeyGuard)
@RateLimit(CHECKOUT_API_LIMIT)
@ApiResponse({ status: 400, description: 'Validation failure', type: ApiErrorDto })
@ApiResponse({ status: 401, description: 'Missing, invalid or revoked API key', type: ApiErrorDto })
@ApiResponse({ status: 429, description: 'Too many requests', type: ApiErrorDto })
export class CheckoutApiController {
  constructor(private readonly checkouts: CheckoutsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a checkout for an order',
    description:
      '201 with a new checkout, or 200 with the existing one when the same orderId was sent ' +
      'before (so a retry never makes two). 409 if that orderId had a different price, ' +
      'currency, coin or network.',
  })
  @ApiCreatedResponse({ type: CheckoutDto, description: 'New checkout' })
  @ApiOkResponse({ type: CheckoutDto, description: 'Existing checkout for this orderId' })
  @ApiResponse({ status: 409, description: 'orderId reused with different details', type: ApiErrorDto })
  async create(
    @ApiKeyBusiness() businessId: string,
    @Body() dto: CreateCheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { checkout, created } = await this.checkouts.create(businessId, dto);
    res.status(created ? HttpStatus.CREATED : HttpStatus.OK);
    return toCheckoutView(checkout);
  }

  // Declared before :id so "by-order" is never read as an id.
  @Get('by-order/:orderId')
  @ApiOperation({ summary: "Find a checkout by the shop's own order id" })
  @ApiOkResponse({ type: CheckoutDetailDto })
  @ApiResponse({ status: 404, description: 'No checkout for this orderId', type: ApiErrorDto })
  byOrder(@ApiKeyBusiness() businessId: string, @Param('orderId') orderId: string) {
    if (orderId.length < 1 || orderId.length > 100) {
      throw new NotFoundException('Checkout not found');
    }
    return this.checkouts.findForBusinessByOrderId(businessId, orderId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Read a checkout and its status' })
  @ApiOkResponse({ type: CheckoutDetailDto })
  @ApiResponse({ status: 404, description: 'Unknown checkout or another business', type: ApiErrorDto })
  findOne(@ApiKeyBusiness() businessId: string, @Param('id', ParseUUIDPipe) id: string) {
    return this.checkouts.findForBusiness(businessId, id);
  }
}
