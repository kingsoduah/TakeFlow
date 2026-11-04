import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateInvoiceDto } from './dto/create-invoice.dto.js';
import { ListInvoicesQueryDto } from './dto/list-invoices.query.js';
import { UpdateInvoiceDto } from './dto/update-invoice.dto.js';

// Manual status machine for Phase 3. Payment outcomes (PARTIALLY_PAID, PAID)
// are written exclusively by reconciliation (Phase 6+); attempting to set them
// manually is rejected. Terminal states cannot be left.
const MANUAL_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  DRAFT: [InvoiceStatus.PENDING, InvoiceStatus.EXPIRED],
  PENDING: [InvoiceStatus.DRAFT, InvoiceStatus.OVERDUE, InvoiceStatus.EXPIRED],
  OVERDUE: [InvoiceStatus.PENDING, InvoiceStatus.EXPIRED],
  PARTIALLY_PAID: [],
  PAID: [],
  EXPIRED: [],
};

const PAYMENT_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
];

const clientSelect = { id: true, name: true, email: true } as const;

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

// Explicit pre-check so duplicate user-supplied numbers surface as 409
// without depending on the driver's P2002 payload shape (Prisma 7 +
// serverless adapters nest it under meta.driverAdapterError). The DB unique
// constraint remains the backstop for races.
async function assertInvoiceNumberFree(
  prisma: PrismaService,
  businessId: string,
  invoiceNumber: string,
  exceptId?: string,
) {
  const clash = await prisma.invoice.findFirst({
    where: {
      businessId,
      invoiceNumber,
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) {
    throw new ConflictException(
      'Invoice number is already used for this business',
    );
  }
}

export function generateInvoiceNumber(date = new Date()): string {
  const stamp = date.toISOString().slice(0, 10).replaceAll('-', '');
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `INV-${stamp}-${rand}`;
}

export function generatePaymentReference(): string {
  return `pay_${randomBytes(16).toString('hex')}`;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
  ) {}

  private async resolveClient(
    businessId: string,
    clientId: string | null | undefined,
  ) {
    if (clientId === undefined) return undefined;
    if (clientId === null) return null;
    // The client must belong to the SAME business. Foreign IDs are 404 so
    // one business can never attach another business's client.
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, businessId },
      select: { id: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client.id;
  }

  private assertCreatableStatus(status: InvoiceStatus | undefined) {
    if (
      status !== undefined &&
      status !== InvoiceStatus.DRAFT &&
      status !== InvoiceStatus.PENDING
    ) {
      throw new BadRequestException(
        'Invoices can only be created as DRAFT or PENDING; payment statuses are set by reconciliation',
      );
    }
  }

  private assertTransition(from: InvoiceStatus, to: InvoiceStatus) {
    if (PAYMENT_STATUSES.includes(to)) {
      throw new BadRequestException(
        'Payment statuses are set by reconciliation and cannot be assigned manually',
      );
    }
    if (from !== to && !MANUAL_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(
        `Cannot move invoice from ${from} to ${to}`,
      );
    }
  }

  async create(ownerId: string, businessId: string, dto: CreateInvoiceDto) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const clientId = await this.resolveClient(businessId, dto.clientId);
    this.assertCreatableStatus(dto.status);

    const amount = new Prisma.Decimal(String(dto.amount));
    if (dto.invoiceNumber) {
      await assertInvoiceNumberFree(this.prisma, businessId, dto.invoiceNumber);
    }
    const base = {
      businessId,
      clientId,
      description: dto.description,
      amount,
      currency: dto.currency,
      cryptoAsset: dto.cryptoAsset,
      network: dto.network,
      dueDate: new Date(dto.dueDate),
      status: dto.status ?? InvoiceStatus.DRAFT,
      amountOutstanding: amount,
    };

    // Generated-value collisions (paymentReference, auto invoice numbers) are
    // retried with fresh values; the DB constraint is the backstop. A
    // user-supplied number that loses a race still surfaces as 409.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.invoice.create({
          data: {
            ...base,
            invoiceNumber: dto.invoiceNumber ?? generateInvoiceNumber(),
            paymentReference: generatePaymentReference(),
          },
          include: { client: { select: clientSelect } },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (dto.invoiceNumber || attempt === 4) {
          throw new ConflictException(
            'Invoice number is already used for this business',
          );
        }
      }
    }
    throw new ConflictException('Could not allocate a unique invoice reference');
  }

  async findAll(
    ownerId: string,
    businessId: string,
    query: ListInvoicesQueryDto,
  ) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const { status, limit = 50, offset = 0 } = query;
    const where = { businessId, ...(status ? { status } : {}) };
    const [data, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: { client: { select: clientSelect } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, limit, offset };
  }

  async findOne(ownerId: string, businessId: string, id: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, businessId },
      include: {
        client: { select: clientSelect },
        business: { select: { businessName: true } },
      },
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  async update(
    ownerId: string,
    businessId: string,
    id: string,
    dto: UpdateInvoiceDto,
  ) {
    const existing = await this.findOne(ownerId, businessId, id);
    const clientId = await this.resolveClient(businessId, dto.clientId);
    if (dto.status !== undefined) {
      this.assertTransition(existing.status, dto.status);
    }
    if (
      dto.invoiceNumber !== undefined &&
      dto.invoiceNumber !== existing.invoiceNumber
    ) {
      await assertInvoiceNumberFree(this.prisma, businessId, dto.invoiceNumber, id);
    }

    // amountOutstanding always mirrors amount - amountReceived using Decimal
    // arithmetic. amountReceived only changes via reconciliation (Phase 6+).
    const amount =
      dto.amount !== undefined ? new Prisma.Decimal(String(dto.amount)) : null;
    const data: Prisma.InvoiceUpdateInput = {
      ...(dto.description !== undefined ? { description: dto.description } : {}),
      ...(dto.dueDate !== undefined ? { dueDate: new Date(dto.dueDate) } : {}),
      ...(dto.invoiceNumber !== undefined
        ? { invoiceNumber: dto.invoiceNumber }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(clientId !== undefined ? { client: clientId ? { connect: { id: clientId } } : { disconnect: true } } : {}),
      ...(amount !== null
        ? {
            amount,
            amountOutstanding: amount.minus(existing.amountReceived),
          }
        : {}),
    };

    try {
      return await this.prisma.invoice.update({
        where: { id },
        data,
        include: { client: { select: clientSelect } },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'Invoice number is already used for this business',
        );
      }
      throw error;
    }
  }

  async remove(ownerId: string, businessId: string, id: string) {
    const existing = await this.findOne(ownerId, businessId, id);
    // Financial records must survive: only un-issued drafts can be deleted.
    if (existing.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestException('Only draft invoices can be deleted');
    }
    await this.prisma.invoice.delete({ where: { id } });
  }
}
