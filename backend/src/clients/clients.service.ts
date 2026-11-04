import { Injectable, NotFoundException } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateClientDto } from './dto/create-client.dto.js';
import { UpdateClientDto } from './dto/update-client.dto.js';

// Clients are always scoped to one business. Every method first proves the
// caller owns the business, then scopes by businessId — a client from another
// business is unreachable even with a valid ID.
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async create(ownerId: string, businessId: string, dto: CreateClientDto) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    return this.prisma.client.create({ data: { ...dto, businessId } });
  }

  async findAll(ownerId: string, businessId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    return this.prisma.client.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const client = await this.prisma.client.findFirst({
      where: { id, businessId },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async update(
    ownerId: string,
    businessId: string,
    id: string,
    dto: UpdateClientDto,
  ) {
    await this.findOne(ownerId, businessId, id);
    return this.prisma.client.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, businessId: string, id: string) {
    await this.findOne(ownerId, businessId, id);
    // Invoices referencing this client keep their financial records; their
    // clientId is set to NULL by the schema (onDelete: SetNull).
    await this.prisma.client.delete({ where: { id } });
  }
}
