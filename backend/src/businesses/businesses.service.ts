import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateBusinessDto } from './dto/create-business.dto.js';
import { UpdateBusinessDto } from './dto/update-business.dto.js';

// Every method scopes by (id, ownerId) at the database level: a user can
// never read or mutate another user's business, even by guessing its ID.
// Unknown and foreign IDs both surface as 404 so ownership is not leaked.
@Injectable()
export class BusinessesService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateBusinessDto) {
    return this.prisma.business.create({ data: { ...dto, ownerId } });
  }

  findAll(ownerId: string) {
    return this.prisma.business.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(ownerId: string, id: string) {
    const business = await this.prisma.business.findFirst({
      where: { id, ownerId },
    });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  // Shared ownership gate for nested resources (clients, invoices, ...).
  // Throws 404 for unknown AND foreign business IDs so ownership is never leaked.
  async assertOwnership(ownerId: string, businessId: string) {
    return this.findOne(ownerId, businessId);
  }

  async update(ownerId: string, id: string, dto: UpdateBusinessDto) {
    await this.findOne(ownerId, id);
    return this.prisma.business.update({ where: { id }, data: dto });
  }

  async remove(ownerId: string, id: string) {
    await this.findOne(ownerId, id);
    await this.prisma.business.delete({ where: { id } });
  }
}
