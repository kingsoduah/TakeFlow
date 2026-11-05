import {
  BadGatewayException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Invoice, InvoiceKind, InvoiceStatus, Prisma, ReconciliationStatus } from '@prisma/client';
import {
  expireIfStale,
  isPastExpiry,
  isPayable,
  PAYMENT_REFERENCE_PATTERN,
  PRODUCT_LINK_REFERENCE_PATTERN,
} from '../checkouts/checkout-rules.js';
import { CheckoutsService } from '../checkouts/checkouts.service.js';
import { ACCEPTED_PAYMENT_PAIRS, coinDecimals, PRICE_CURRENCIES } from '../pricing/catalog.js';
import { cryptoForFiat, roundMoney } from '../pricing/money.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PriceUnavailableError,
  QuotesService,
  QuoteWithRateTime,
} from '../quotes/quotes.service.js';
import { convertWithSnapshot, rateFromSnapshot, RatesService } from '../rates/rates.service.js';
import { RoqquError } from '../roqqu/roqqu.service.js';
import { WalletsService } from '../wallets/wallets.service.js';

export const PRICE_UNAVAILABLE_MESSAGE =
  'The price is unavailable right now because no current exchange rate could be fetched. Please try again in a minute.';
export const ADDRESS_FAILED_MESSAGE =
  'A payment address could not be created right now. Please try again.';

export type PublicInvoice = Invoice & {
  business: { businessName: string; quoteWindowMinutes: number };
};

const money = (value: Prisma.Decimal) => value.toFixed();

// Public payment page data, looked up by the invoice's paymentReference.
// No login. Every response is built from that one invoice and its own
// business name: no internal IDs, no client or buyer contact details, and
// nothing from any other business.
@Injectable()
export class PublicPaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly quotes: QuotesService,
    private readonly rates: RatesService,
    private readonly wallets: WalletsService,
    private readonly checkouts: CheckoutsService,
  ) {}

  options() {
    return {
      currencies: [...PRICE_CURRENCIES],
      paymentPairs: ACCEPTED_PAYMENT_PAIRS.map((pair) => ({ ...pair })),
    };
  }

  async getPayment(reference: string, displayCurrency?: string, now = new Date()) {
    const invoice = await this.load(reference, now);
    return this.buildView(invoice, displayCurrency, now);
  }

  // Returns the active quote, or makes a fresh one, and makes sure the
  // invoice has a receiving address. The address is created here (when the
  // payer asks to pay), never on a plain page view.
  async requestQuote(reference: string, displayCurrency?: string, now = new Date()) {
    const invoice = await this.load(reference, now);
    this.assertPayable(invoice, now);
    await this.quoteAndAddress(invoice, now);
    return this.buildView(invoice, displayCurrency, now);
  }

  // Shared with the product link flow. Mutates paymentAddress on the passed
  // invoice so the view shows the new address without another read.
  async quoteAndAddress(invoice: PublicInvoice, now: Date) {
    try {
      await this.quotes.getOrCreate(invoice, now);
    } catch (error) {
      if (error instanceof PriceUnavailableError) {
        throw new ServiceUnavailableException(PRICE_UNAVAILABLE_MESSAGE);
      }
      throw error;
    }
    if (!invoice.paymentAddress) {
      try {
        const result = await this.wallets.ensureAddress(invoice.id);
        invoice.paymentAddress = result.address;
      } catch (error) {
        if (error instanceof RoqquError) {
          throw new BadGatewayException(ADDRESS_FAILED_MESSAGE);
        }
        throw error;
      }
    }
  }

  // A product link page: the product, its price and an indicative crypto
  // amount at the latest rate. Nothing is held and no address is made until
  // the buyer taps Pay.
  async getProductLink(reference: string, now = new Date()) {
    const link = await this.loadLink(reference);
    let indicative: { cryptoAmount: string; rate: string; rateFetchedAt: Date } | null = null;
    if (link.active) {
      const snapshot = await this.rates.getFreshSnapshot(now);
      const rate = snapshot ? rateFromSnapshot(snapshot, link.cryptoAsset, link.currency) : null;
      if (snapshot && rate) {
        indicative = {
          cryptoAmount: money(cryptoForFiat(link.amount, rate, coinDecimals(link.cryptoAsset))),
          rate: money(rate),
          rateFetchedAt: snapshot.fetchedAt,
        };
      }
    }
    return {
      reference: link.reference,
      businessName: link.business.businessName,
      title: link.title,
      description: link.description,
      amount: money(link.amount),
      currency: link.currency,
      cryptoAsset: link.cryptoAsset,
      network: link.network,
      active: link.active,
      indicative,
    };
  }

  // The buyer tapped Pay on a product link: they get their own checkout with
  // its own address, quote and status. The price is checked first, so a
  // missing rate never uses up a Roqqu address. Buyer name and email are
  // optional; the shop details stand in for Roqqu when they are left out.
  async startProductLinkCheckout(
    reference: string,
    buyer: { buyerName?: string; buyerEmail?: string },
    displayCurrency?: string,
    now = new Date(),
  ) {
    const link = await this.loadLink(reference);
    if (!link.active) {
      throw new GoneException('This payment link is no longer active');
    }
    const snapshot = await this.rates.getFreshSnapshot(now);
    if (!snapshot || !rateFromSnapshot(snapshot, link.cryptoAsset, link.currency)) {
      throw new ServiceUnavailableException(PRICE_UNAVAILABLE_MESSAGE);
    }

    const { checkout } = await this.checkouts.create(
      link.businessId,
      {
        amount: link.amount.toFixed(),
        currency: link.currency,
        cryptoAsset: link.cryptoAsset,
        network: link.network,
        description: link.title,
        buyerName: buyer.buyerName,
        buyerEmail: buyer.buyerEmail,
        returnUrl: link.returnUrl,
        productLinkId: link.id,
      },
      now,
    );
    const invoice: PublicInvoice = {
      ...checkout,
      business: {
        businessName: link.business.businessName,
        quoteWindowMinutes: link.business.quoteWindowMinutes,
      },
    };
    try {
      await this.quoteAndAddress(invoice, now);
    } catch (error) {
      // The buyer never received this checkout's reference, so nobody can
      // pay it. Closing it keeps it out of the shop's amounts owed.
      await this.prisma.invoice.updateMany({
        where: { id: checkout.id, status: InvoiceStatus.PENDING },
        data: { status: InvoiceStatus.EXPIRED },
      });
      throw error;
    }
    return this.buildView(invoice, displayCurrency, now);
  }

  private async loadLink(reference: string) {
    if (!PRODUCT_LINK_REFERENCE_PATTERN.test(reference)) {
      throw new NotFoundException('Payment link not found');
    }
    const link = await this.prisma.productLink.findUnique({
      where: { reference },
      include: { business: { select: { businessName: true, quoteWindowMinutes: true } } },
    });
    if (!link) throw new NotFoundException('Payment link not found');
    return link;
  }

  async load(reference: string, now: Date): Promise<PublicInvoice> {
    if (!PAYMENT_REFERENCE_PATTERN.test(reference)) {
      throw new NotFoundException('Payment not found');
    }
    const invoice = await this.prisma.invoice.findUnique({
      where: { paymentReference: reference },
      include: { business: { select: { businessName: true, quoteWindowMinutes: true } } },
    });
    // Drafts have not been issued, so they are not public.
    if (!invoice || invoice.status === InvoiceStatus.DRAFT) {
      throw new NotFoundException('Payment not found');
    }
    return expireIfStale(this.prisma, invoice, now);
  }

  private assertPayable(invoice: PublicInvoice, now: Date) {
    if (isPayable(invoice, now)) return;
    if (invoice.status === InvoiceStatus.PAID) {
      throw new ConflictException('This payment is already complete');
    }
    if (invoice.status === InvoiceStatus.EXPIRED || isPastExpiry(invoice, now)) {
      throw new GoneException('This payment link has expired');
    }
    if (invoice.amountOutstanding.lessThanOrEqualTo(0)) {
      throw new ConflictException('Nothing is owed on this payment');
    }
    throw new ConflictException('This payment cannot be paid right now');
  }

  async buildView(invoice: PublicInvoice, displayCurrency: string | undefined, now: Date) {
    const [latestQuote, payments] = await Promise.all([
      this.quotes.findActive(invoice.id, now),
      this.prisma.transaction.findMany({
        where: { invoiceId: invoice.id, reconciliationStatus: ReconciliationStatus.MATCHED },
        orderBy: { createdAt: 'asc' },
        select: {
          transactionHash: true,
          asset: true,
          network: true,
          amount: true,
          valueAmount: true,
          valueCurrency: true,
          valuationMethod: true,
          depositedAt: true,
          createdAt: true,
        },
      }),
    ]);
    const payable = isPayable(invoice, now);
    // A quote made before a part payment asks for too much. It still values
    // payments sent inside its window, but the page should ask for a fresh
    // quote instead of showing it.
    const quote =
      payable && latestQuote && latestQuote.amountDue.equals(invoice.amountOutstanding)
        ? latestQuote
        : null;

    return {
      kind: invoice.kind,
      paymentReference: invoice.paymentReference,
      businessName: invoice.business.businessName,
      invoiceNumber: invoice.invoiceNumber,
      description: invoice.description,
      amount: money(invoice.amount),
      currency: invoice.currency,
      amountReceived: money(invoice.amountReceived),
      amountOutstanding: money(invoice.amountOutstanding),
      amountOverpaid: money(invoice.amountOverpaid),
      cryptoAsset: invoice.cryptoAsset,
      network: invoice.network,
      address: invoice.paymentAddress,
      status: invoice.status,
      payable,
      dueDate: invoice.kind === InvoiceKind.INVOICE ? invoice.dueDate : null,
      expiresAt: invoice.kind === InvoiceKind.CHECKOUT ? invoice.expiresAt : null,
      returnUrl: invoice.kind === InvoiceKind.CHECKOUT ? invoice.returnUrl : null,
      quote: quote ? publicQuote(quote) : null,
      payments: payments.map((payment) => ({
        transactionHash: payment.transactionHash,
        asset: payment.asset,
        network: payment.network,
        amount: money(payment.amount),
        valueAmount: payment.valueAmount ? money(payment.valueAmount) : null,
        valueCurrency: payment.valueCurrency,
        valuationMethod: payment.valuationMethod,
        depositedAt: payment.depositedAt,
        receivedAt: payment.createdAt,
      })),
      display: displayCurrency ? await this.displayAmounts(invoice, displayCurrency, now) : null,
      serverTime: now,
    };
  }

  // The payer's own display currency (design doc 5.8). Converted at the
  // latest rate, for display only.
  private async displayAmounts(invoice: PublicInvoice, currency: string, now: Date) {
    if (currency === invoice.currency) {
      return {
        currency,
        amount: money(invoice.amount),
        amountReceived: money(invoice.amountReceived),
        amountOutstanding: money(invoice.amountOutstanding),
        rateFetchedAt: null,
      };
    }
    const snapshot = await this.rates.getFreshSnapshot(now);
    if (!snapshot) return null;
    const convert = (value: Prisma.Decimal) =>
      convertWithSnapshot(value, invoice.currency, currency, snapshot);
    const amount = convert(invoice.amount);
    const received = convert(invoice.amountReceived);
    const outstanding = convert(invoice.amountOutstanding);
    if (!amount || !received || !outstanding) return null;
    return {
      currency,
      amount: money(roundMoney(amount)),
      amountReceived: money(roundMoney(received)),
      amountOutstanding: money(roundMoney(outstanding)),
      rateFetchedAt: snapshot.fetchedAt,
    };
  }
}

export function publicQuote(quote: QuoteWithRateTime) {
  return {
    cryptoAmount: money(quote.cryptoAmount),
    cryptoAsset: quote.cryptoAsset,
    network: quote.network,
    priceCurrency: quote.priceCurrency,
    amountDue: money(quote.amountDue),
    rate: money(quote.rate),
    rateFetchedAt: quote.rateSnapshot.fetchedAt,
    createdAt: quote.createdAt,
    expiresAt: quote.expiresAt,
  };
}
