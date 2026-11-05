import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BusinessesService } from '../businesses/businesses.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoqquService } from '../roqqu/roqqu.service.js';

export interface AddressResult {
  address: string;
  network: string;
  reused: boolean;
}

interface AddressableInvoice {
  id: string;
  businessId: string;
  network: string;
  paymentAddress: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  client: { name: string; email: string | null } | null;
  business: { businessName: string; businessEmail: string | null };
}

const ADDRESS_INCLUDE = {
  client: { select: { name: true, email: true } },
  business: { select: { businessName: true, businessEmail: true } },
} as const;

// Invoice and checkout receiving addresses. Roqqu generates NETWORK-level
// addresses (the generate-wallet endpoint takes a network code, not an
// asset), so one address serves any token on that network and asset
// matching happens at reconciliation time. Generation is idempotent per
// invoice: one that already has a payment address never triggers another
// Roqqu call, and the address is only assigned if none was set meanwhile,
// so two requests at once can never leave a payer with an address that the
// invoice no longer points at.
@Injectable()
export class WalletsService {
  // Concurrent requests for the same invoice in this process share one
  // Roqqu call.
  private readonly inFlight = new Map<string, Promise<AddressResult>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly businessesService: BusinessesService,
    private readonly roqqu: RoqquService,
  ) {}

  async getOrCreateAddress(ownerId: string, businessId: string, invoiceId: string) {
    await this.businessesService.assertOwnership(ownerId, businessId);
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, businessId },
      include: ADDRESS_INCLUDE,
    });
    if (!invoice) {
      throw new BadRequestException('Invoice not found');
    }
    return this.assign(invoice);
  }

  // For the public payment flow, where the payer's request (not a logged in
  // owner) asks for the address. Callers have already resolved the invoice
  // from its payment reference.
  async ensureAddress(invoiceId: string): Promise<AddressResult> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: ADDRESS_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException('Payment not found');
    }
    return this.assign(invoice);
  }

  private assign(invoice: AddressableInvoice): Promise<AddressResult> {
    if (invoice.paymentAddress) {
      return Promise.resolve({
        address: invoice.paymentAddress,
        network: invoice.network,
        reused: true,
      });
    }
    const pending = this.inFlight.get(invoice.id);
    if (pending) return pending;
    const work = this.generate(invoice).finally(() => this.inFlight.delete(invoice.id));
    this.inFlight.set(invoice.id, work);
    return work;
  }

  private async generate(invoice: AddressableInvoice): Promise<AddressResult> {
    const customer = this.resolveCustomer(invoice);
    const generated = await this.roqqu.generateWallet(invoice.network, customer);
    const address = generated.data.address;

    // The wallet row is written first: reconciliation finds the business
    // from it, so a deposit to this address is never lost.
    await this.prisma.wallet.create({
      data: {
        businessId: invoice.businessId,
        invoiceId: invoice.id,
        address,
        network: invoice.network,
        customerEmail: customer.email,
      },
    });
    const assigned = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, paymentAddress: null },
      data: { paymentAddress: address },
    });
    if (assigned.count === 0) {
      // Another request assigned an address first. Return that one; this
      // address stays on record and was never shown to anyone.
      const current = await this.prisma.invoice.findUnique({
        where: { id: invoice.id },
        select: { paymentAddress: true },
      });
      if (current?.paymentAddress) {
        return { address: current.paymentAddress, network: invoice.network, reused: true };
      }
    }
    return { address, network: invoice.network, reused: false };
  }

  // The Roqqu customer object requires email + first/last name. Checkout
  // buyer details come first, then the invoice client, then the business
  // (the fallback when a buyer skips the form or an invoice has no client).
  // TakeFlow stores a single name, so it is split on the first word; a
  // single-word name reuses it as the last name.
  private resolveCustomer(invoice: AddressableInvoice): {
    email: string;
    first_name: string;
    last_name: string;
  } {
    const name =
      invoice.buyerName?.trim() || invoice.client?.name || invoice.business.businessName;
    const email = invoice.buyerEmail || invoice.client?.email || invoice.business.businessEmail;
    if (!name?.trim() || !email) {
      throw new BadRequestException(
        'A name and email are required to generate an address: give a buyer email, or add an email to the client or the business',
      );
    }
    const parts = name.trim().split(/\s+/);
    const first_name = parts[0];
    const last_name = parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
    return { email, first_name, last_name };
  }
}
