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
import { BusinessesService } from './businesses.service.js';
import { BusinessDto } from './dto/business.dto.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';

@ApiTags('businesses')
@ApiCommonErrors()
@Controller('businesses')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post()
  @ApiCreatedResponse({ type: BusinessDto })
  create(
    @CurrentUser('userId') ownerId: string,
    @Body() dto: CreateBusinessDto,
  ) {
    return this.businessesService.create(ownerId, dto);
  }

  @Get()
  @ApiOkResponse({ type: [BusinessDto] })
  findAll(@CurrentUser('userId') ownerId: string) {
    return this.businessesService.findAll(ownerId);
  }

  @Get(':id')
  @ApiOkResponse({ type: BusinessDto })
  findOne(
    @CurrentUser('userId') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.businessesService.findOne(ownerId, id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: BusinessDto })
  update(
    @CurrentUser('userId') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.businessesService.update(ownerId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser('userId') ownerId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.businessesService.remove(ownerId, id);
  }
}
