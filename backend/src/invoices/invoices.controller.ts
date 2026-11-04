import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import { AddressResponseDto } from '../wallets/dto/address-response.dto.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { InvoiceDto, InvoiceListDto } from './dto/invoice.dto.js';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.js';
import { PaymentInstructionsDto } from './dto/payment-instructions.dto.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';
import { InvoicesService } from './invoices.service.js';
import { WalletsService } from '../wallets/wallets.service.js';

@ApiTags('invoices')
@ApiCommonErrors()
@Controller('businesses/:businessId/invoices')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(
    private readonly invoicesService: InvoicesService,
    private readonly walletsService: WalletsService,
  ) {}

  @Post()
  @ApiCreatedResponse({ type: InvoiceDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateInvoiceDto,
  ) {
    return this.invoicesService.create(ownerId, businessId, dto);
  }

  @Get()
  @ApiOkResponse({ type: InvoiceListDto })
  findAll(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: ListInvoicesQueryDto,
  ) {
    return this.invoicesService.findAll(ownerId, businessId, query);
  }

  @Get(':id')
  @ApiOkResponse({ type: InvoiceDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invoicesService.findOne(ownerId, businessId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: InvoiceDto })
  update(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateInvoiceDto,
  ) {
    return this.invoicesService.update(ownerId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.invoicesService.remove(ownerId, businessId, id);
  }

  // Idempotent: an invoice that already has an address returns it without
  // calling Roqqu again. Exposes no Roqqu internals — just the address.
  @Post(':id/address')
  @ApiCreatedResponse({
    type: AddressResponseDto,
    description:
      'Address assigned (or reused). Safe to call repeatedly; Roqqu is only called once per invoice.',
  })
  generateAddress(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.walletsService.getOrCreateAddress(ownerId, businessId, id);
  }

  // Customer-facing payment instructions. Usable before an address exists
  // (paymentReady: false); never includes credentials.
  @Get(':id/payment')
  @ApiOkResponse({ type: PaymentInstructionsDto })
  async paymentInstructions(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const invoice = await this.invoicesService.findOne(ownerId, businessId, id);
    return {
      businessName: invoice.business.businessName,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentReference: invoice.paymentReference,
      description: invoice.description,
      amount: invoice.amount,
      currency: invoice.currency,
      cryptoAsset: invoice.cryptoAsset,
      network: invoice.network,
      address: invoice.paymentAddress,
      paymentReady: invoice.paymentAddress !== null,
      status: invoice.status,
      amountReceived: invoice.amountReceived,
      amountOutstanding: invoice.amountOutstanding,
      dueDate: invoice.dueDate,
      client: invoice.client,
    };
  }
}
