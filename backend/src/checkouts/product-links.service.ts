import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductLink } from '@prisma/client';
import { BusinessesService } from '../businesses/businesses.service.js';
import { assertPriceable } from '../pricing/assert-priceable.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateProductLinkReference } from './checkout-rules.js';
import { CreateProductLinkDto, UpdateProductLinkDto } from './dto/product-link.dto.js';

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function toProductLinkView(link: ProductLink) {
  return {
    id: link.id,
    reference: link.reference,
    title: link.title,
    description: link.description,
    amount: link.amount.toFixed(),
    currency: link.currency,
    cryptoAsset: link.cryptoAsset,
    network: link.network,
    returnUrl: link.returnUrl,
    active: link.active,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
  };
}

// Reusable product links (design doc 5.5, Agreed). A link stays open until
// the shop turns it off. Buyers start their own checkouts from it through
// the public routes.
@Injectable()
export class ProductLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  async create(ownerId: string, businessId: string, dto: CreateProductLinkDto) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    assertPriceable(dto.currency, dto.cryptoAsset, dto.network);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const link = await this.prisma.productLink.create({
          data: {
            businessId,
            reference: generateProductLinkReference(),
            title: dto.title,
            description: dto.description,
            amount: new Prisma.Decimal(String(dto.amount)),
            currency: dto.currency,
            cryptoAsset: dto.cryptoAsset,
            network: dto.network,
            returnUrl: dto.returnUrl,
          },
        });
        return toProductLinkView(link);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new ConflictException('Could not allocate a unique link reference');
  }

  async findAll(ownerId: string, businessId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const links = await this.prisma.productLink.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    return links.map(toProductLinkView);
  }

  async findOne(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    return toProductLinkView(await this.load(businessId, id));
  }

  async update(ownerId: string, businessId: string, id: string, dto: UpdateProductLinkDto) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const existing = await this.load(businessId, id);
    // The price fields are checked together after merging, so changing only
    // the coin still has to form an accepted pair with the stored network.
    assertPriceable(
      dto.currency ?? existing.currency,
      dto.cryptoAsset ?? existing.cryptoAsset,
      dto.network ?? existing.network,
    );
    // Required fields ignore null (left unchanged); description and
    // returnUrl accept null to clear them.
    const link = await this.prisma.productLink.update({
      where: { id: existing.id },
      data: {
        ...(dto.title != null ? { title: dto.title } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount != null ? { amount: new Prisma.Decimal(String(dto.amount)) } : {}),
        ...(dto.currency != null ? { currency: dto.currency } : {}),
        ...(dto.cryptoAsset != null ? { cryptoAsset: dto.cryptoAsset } : {}),
        ...(dto.network != null ? { network: dto.network } : {}),
        ...(dto.returnUrl !== undefined ? { returnUrl: dto.returnUrl } : {}),
        ...(typeof dto.active === 'boolean' ? { active: dto.active } : {}),
      },
    });
    return toProductLinkView(link);
  }

  private async load(businessId: string, id: string) {
    const link = await this.prisma.productLink.findFirst({ where: { id, businessId } });
    if (!link) throw new NotFoundException('Product link not found');
    return link;
  }
}
