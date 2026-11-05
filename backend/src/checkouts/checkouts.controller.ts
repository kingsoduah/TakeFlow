import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { CheckoutsService } from './checkouts.service.js';
import {
  CheckoutDetailDto,
  CheckoutDto,
  CheckoutListDto,
  CreateCheckoutDto,
  ListCheckoutsQueryDto,
} from './dto/checkout.dto.js';
import {
  CreateProductLinkDto,
  ProductLinkDto,
  UpdateProductLinkDto,
} from './dto/product-link.dto.js';
import { ProductLinksService } from './product-links.service.js';

@ApiTags('checkouts')
@ApiCommonErrors()
@Controller('businesses/:businessId/checkouts')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class CheckoutsController {
  constructor(private readonly checkouts: CheckoutsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a one-order checkout link by hand',
    description:
      'Starts PENDING and expires after expiresInMinutes (default 24 hours) if unpaid. The ' +
      'payer opens the payment page by paymentReference; the address is made when they ask to pay.',
  })
  @ApiCreatedResponse({ type: CheckoutDto })
  @ApiResponse({ status: 409, description: 'orderId reused with different details', type: ApiErrorDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.checkouts.createForOwner(ownerId, businessId, dto);
  }

  @Get()
  @ApiOkResponse({ type: CheckoutListDto })
  findAll(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: ListCheckoutsQueryDto,
  ) {
    return this.checkouts.listForOwner(ownerId, businessId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: CheckoutDetailDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.checkouts.findOneForOwner(ownerId, businessId, id);
  }
}

@ApiTags('product links')
@ApiCommonErrors()
@Controller('businesses/:businessId/product-links')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ProductLinksController {
  constructor(private readonly links: ProductLinksService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a reusable product link',
    description:
      'Share /pay/links/:reference anywhere. Each buyer who taps Pay starts their own checkout.',
  })
  @ApiCreatedResponse({ type: ProductLinkDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateProductLinkDto,
  ) {
    return this.links.create(ownerId, businessId, dto);
  }

  @Get()
  @ApiOkResponse({ type: [ProductLinkDto] })
  findAll(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.links.findAll(ownerId, businessId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ProductLinkDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.links.findOne(ownerId, businessId, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit a product link or turn it off (active: false)',
    description: 'Send cryptoAsset and network together when changing the pair.',
  })
  @ApiOkResponse({ type: ProductLinkDto })
  update(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductLinkDto,
  ) {
    return this.links.update(ownerId, businessId, id, dto);
  }
}
