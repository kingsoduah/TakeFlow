import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import {
  BusinessSummaryDto,
  InvoicePaymentsDto,
  TransactionDto,
  TransactionListDto,
} from './dto/transaction.dto.js';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@ApiCommonErrors()
@Controller('businesses/:businessId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get('transactions')
  @ApiOkResponse({ type: TransactionListDto })
  findAll(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.findAll(ownerId, businessId, query);
  }

  @Get('transactions/:id')
  @ApiOkResponse({ type: TransactionDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.findOne(ownerId, businessId, id);
  }

  @Get('invoices/:id/payments')
  @ApiOkResponse({
    type: InvoicePaymentsDto,
    description: 'Matched payments plus current invoice balances',
  })
  invoicePayments(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transactionsService.invoicePayments(ownerId, businessId, id);
  }

  @Get('summary')
  @ApiOkResponse({
    type: BusinessSummaryDto,
    description: 'Receivables totals, status counts and unmatched deposits',
  })
  summary(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.transactionsService.businessSummary(ownerId, businessId);
  }
}
