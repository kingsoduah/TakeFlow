import { BadRequestException, Injectable } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoqquService } from '../roqqu/roqqu.service.js';

// Invoice receiving addresses. Roqqu generates NETWORK-level addresses (the
// generate-wallet endpoint takes a network code, not an asset), so one
// address serves any token on that network and asset matching happens at
// reconciliation time. Generation is idempotent per invoice: an invoice that
// already has a payment address never triggers another Roqqu call.
@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
    private readonly roqqu: RoqquService,
  ) {}

  async getOrCreateAddress(ownerId: string, businessId: string, invoiceId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: {
        client: { select: { name: true, email: true } },
        business: { select: { businessName: true, businessEmail: true } },
      },
    });
    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }
    if (invoice.paymentAddress) {
      return {
        address: invoice.paymentAddress,
        network: invoice.network,
        reused: true as const,
      };
    }

    const customer = this.resolveCustomer(invoice);
    const generated = await this.roqqu.generateWallet(invoice.network, customer);
    const address = generated.data.address;

    await this.prisma.wallet.create({
      data: {
        businessId,
        invoiceId: invoice.id,
        address,
        network: invoice.network,
        customerEmail: customer.email,
      },
    });
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { paymentAddress: address },
    });
    return { address, network: invoice.network, reused: false as const };
  }

  // The Roqqu customer object requires email + first/last name. TakeFlow
  // stores a single client name, so it is split on the first word; a
  // single-word name reuses it as the last name. Business details are the
  // fallback when the invoice has no client.
  private resolveCustomer(invoice: {
    client: { name: string; email: string | null } | null;
    business: { businessName: string; businessEmail: string | null };
  }): { email: string; first_name: string; last_name: string } {
    const name = invoice.client?.name ?? invoice.business.businessName;
    const email = invoice.client?.email ?? invoice.business.businessEmail;
    if (!name?.trim() || !email) {
      throw new BadRequestException(
        'A client or business email and name are required to generate an address',
      );
    }
    const parts = name.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    return { email, first_name, last_name };
  }
}
