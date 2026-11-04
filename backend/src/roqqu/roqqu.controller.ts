import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import { RoqquService } from './roqqu.service.js';

// Merchant-level Roqqu reads. Balances belong to the Roqqu merchant account,
// not to any single TakeFlow business — documented as such.
@ApiTags('roqqu')
@ApiCommonErrors()
@Controller('roqqu')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RoqquController {
  constructor(private readonly roqqu: RoqquService) {}

  @Get('balances')
  @ApiOperation({
    summary: 'Merchant balances',
    description:
      'Proxies POST /balances. These balances belong to the Roqqu merchant ' +
      'account and are shared across all TakeFlow businesses.',
  })
  @ApiQuery({ name: 'email', required: false, example: 'merchant@example.com' })
  @ApiQuery({ name: 'token', required: false, example: 'usdt' })
  @ApiOkResponse({
    description: 'Raw Roqqu success envelope: { status, message, data }',
    schema: {
      example: {
        status: 'success',
        message: 'Balances fetched successfully',
        data: { usdt: 137, ngn: 50000 },
      },
    },
  })
  balances(@Query('email') email?: string, @Query('token') token?: string) {
    return this.roqqu.getBalances(email, token);
  }

  @Get('webhooks')
  @ApiOperation({
    summary: 'Roqqu webhook history',
    description: 'Proxies GET /webhooks for the merchant account.',
  })
  @ApiOkResponse({
    description: 'Raw Roqqu success envelope: { status, message, data }',
    schema: {
      example: { status: 'success', message: 'Webhooks fetched', data: {} },
    },
  })
  webhooks() {
    return this.roqqu.getWebhooks();
  }
}
