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
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ApiCommonErrors } from '../common/dto/api-common-errors.decorator.js';
import { ClientsService } from './clients.service.js';
import { ClientDto } from './dto/client.dto.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

@ApiTags('clients')
@ApiCommonErrors()
@Controller('businesses/:businessId/clients')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @ApiCreatedResponse({ type: ClientDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Body() dto: CreateClientDto,
  ) {
    return this.clientsService.create(ownerId, businessId, dto);
  }

  @Get()
  @ApiOkResponse({ type: [ClientDto] })
  findAll(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
  ) {
    return this.clientsService.findAll(ownerId, businessId);
  }

  @Get(':id')
  @ApiOkResponse({ type: ClientDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.clientsService.findOne(ownerId, businessId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: ClientDto })
  update(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(ownerId, businessId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('userId') ownerId: string,
    @Param('businessId', ParseUUIDPipe) businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.clientsService.remove(ownerId, businessId, id);
  }
}
