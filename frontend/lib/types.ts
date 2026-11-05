// Shapes returned by the TakeFlow API (NestJS, /api/v1). Money is always a
// decimal string, exactly as the API sends it. Never turn it into a float to
// show it: format it with lib/money.ts.

export const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS"] as const;
export type Currency = (typeof CURRENCIES)[number];

export type CryptoAsset = "USDT" | "USDC";
export type Network = "trc20" | "bep20" | "base";

export interface PaymentPair {
  id: string;
  cryptoAsset: CryptoAsset;
  network: Network;
  networkName: string;
  networkShort: string;
}

// The three coin and network pairs TakeFlow accepts.
export const PAYMENT_PAIRS: PaymentPair[] = [
  { id: "USDT-trc20", cryptoAsset: "USDT", network: "trc20", networkName: "Tron (TRC20)", networkShort: "TRC20" },
  { id: "USDT-bep20", cryptoAsset: "USDT", network: "bep20", networkName: "BNB Smart Chain (BEP20)", networkShort: "BEP20" },
  { id: "USDC-base", cryptoAsset: "USDC", network: "base", networkName: "Base", networkShort: "Base" },
];

export type InvoiceStatus = "DRAFT" | "PENDING" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "EXPIRED";
export const INVOICE_STATUSES: InvoiceStatus[] = ["DRAFT", "PENDING", "PARTIALLY_PAID", "PAID", "OVERDUE", "EXPIRED"];
export type InvoiceKind = "INVOICE" | "CHECKOUT";
export type ReconciliationStatus = "PENDING" | "MATCHED" | "UNMATCHED";
export type ValuationMethod = "QUOTE" | "ARRIVAL";

export interface User {
  id: string;
  fullName: string;
  email: string;
  displayCurrency?: Currency | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface Business {
  id: string;
  ownerId: string;
  businessName: string;
  businessEmail?: string | null;
  businessType?: string | null;
  quoteWindowMinutes?: number;
  shortfallToleranceBps?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Client {
  id: string;
  businessId: string;
  name: string;
  email?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceClient {
  id: string;
  name: string;
  email?: string | null;
}

export interface Invoice {
  id: string;
  businessId: string;
  kind?: InvoiceKind;
  clientId?: string | null;
  invoiceNumber: string;
  paymentReference: string;
  description?: string | null;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  issueDate: string;
  dueDate: string;
  paymentAddress?: string | null;
  status: InvoiceStatus;
  amountReceived: string;
  amountOutstanding: string;
  amountOverpaid?: string;
  createdAt: string;
  updatedAt: string;
  client?: InvoiceClient | null;
  // Checkout fields (kind CHECKOUT). Null on plain invoices.
  externalOrderId?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  returnUrl?: string | null;
  expiresAt?: string | null;
  productLinkId?: string | null;
  productTitle?: string | null;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface TransactionInvoiceRef {
  id: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  kind?: InvoiceKind;
  clientName?: string | null;
  externalOrderId?: string | null;
  productTitle?: string | null;
}

export interface Transaction {
  id: string;
  businessId?: string | null;
  invoiceId?: string | null;
  transactionHash: string;
  receivingAddress: string;
  senderAddress?: string | null;
  asset: CryptoAsset | string;
  network: Network | string;
  amount: string;
  excessAmount: string;
  reconciliationStatus: ReconciliationStatus;
  occurredAt?: string | null;
  createdAt: string;
  updatedAt: string;
  invoice?: TransactionInvoiceRef | null;
  // Valuation, written once when the payment is matched.
  depositedAt?: string | null;
  valueCurrency?: Currency | null;
  valueAmount?: string | null;
  valuationRate?: string | null;
  valuationMethod?: ValuationMethod | null;
  valuedAt?: string | null;
  rateSnapshotId?: string | null;
  quoteId?: string | null;
}

export interface InvoicePayments {
  invoice: Invoice;
  transactions: Transaction[];
  totalReceived: string;
  amountOutstanding: string;
  paymentCount: number;
}

export interface AddressResponse {
  address: string;
  network: Network;
  reused: boolean;
}

export interface RatesSnapshot {
  fetchedAt: string;
  // Units of each currency per 1 US dollar, as decimal strings.
  perUsd: Record<Currency, string>;
  // USD price of each accepted coin, as decimal strings.
  coins: Record<CryptoAsset, string>;
}

export interface ProductLink {
  id: string;
  businessId: string;
  reference: string;
  title: string;
  description?: string | null;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  returnUrl?: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  salesCount: number;
  totalReceived: string;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt?: string | null;
  revokedAt?: string | null;
  createdAt: string;
}

export interface CreatedApiKey extends ApiKey {
  // The full key. The API returns it only once, at creation.
  key: string;
}

// ---------- Dashboard ----------

export interface SegmentTotal {
  amount: string | null; // null: a rate it needs is unavailable
  invoiceCount: number;
}

export interface AttentionItem {
  kind: "OVERDUE" | "UNMATCHED" | "PARTIALLY_PAID";
  id: string;
  invoiceId?: string;
  invoiceNumber?: string;
  clientName?: string;
  paymentReference?: string;
  amount: string;
  currency: Currency | string;
  amountReceived?: string;
  amountTotal?: string;
  dueDate?: string;
  transactionId?: string;
  asset?: string;
  network?: string;
  senderAddress?: string | null;
  occurredAt?: string | null;
}

export interface DashboardSeriesPoint {
  date: string; // YYYY-MM-DD
  received: string;
  invoiced: string;
}

export interface Dashboard {
  currency: Currency;
  periodLabel: string; // "last 30 days" or "all time"
  from: string | null;
  to: string;
  totals: {
    // null: a rate the total needs is unavailable ("Rate unavailable")
    invoiced: string | null;
    received: string | null;
    outstanding: string | null;
    partlyPaidOwed: SegmentTotal;
    waitingOwed: SegmentTotal;
    overdueOwed: SegmentTotal;
    paid: SegmentTotal;
  };
  previous?: {
    invoiced: string;
    received: string;
    outstanding: string;
    paymentsMatched: number;
    overdueCount: number;
  } | null;
  counts: {
    invoices: number;
    currencies: number;
    paymentsMatched: number;
    open: number;
    overdue: number;
    byStatus: Record<InvoiceStatus, number>;
    activeLinks: number;
  };
  unmatched: { count: number; amount: string; asset: string; latestTransactionId?: string | null };
  avgDaysToPay?: number | null;
  statusNotes: { partlyNextDue: string | null; waitingNextDue: string | null; overdueOldestDue: string | null };
  series: DashboardSeriesPoint[] | null; // daily, oldest first, in the display currency; null without rates
  outstandingSeries?: string[]; // daily still owed, last 30 days
  rates: RatesSnapshot | null; // null: no rate source, so the 1 USDT chips are hidden
  ratesAsOf: string | null;
  lastPaymentAt?: string | null;
  attention: AttentionItem[];
  productLinks: ProductLink[];
  recentPayments: Transaction[];
}

// ---------- Public payment page (GET /pay/:paymentReference) ----------

export interface PublicQuote {
  cryptoAmount: string;
  cryptoAsset: CryptoAsset;
  network: Network;
  priceCurrency: Currency;
  amountDue: string; // still owed in the price currency when quoted
  rate: string; // price currency per 1 coin
  rateFetchedAt: string;
  createdAt: string;
  expiresAt: string;
}

export interface PublicPaymentRecord {
  transactionHash: string;
  asset: string;
  network: string;
  amount: string;
  valueAmount: string | null;
  valueCurrency: string | null;
  valuationMethod: ValuationMethod | null;
  depositedAt: string | null;
  receivedAt: string;
}

// The payer's own view currency, converted by the API. View only.
export interface PublicDisplay {
  currency: Currency;
  amount: string;
  amountReceived: string;
  amountOutstanding: string;
  rateFetchedAt: string | null;
}

export interface PublicPayment {
  kind: InvoiceKind;
  paymentReference: string;
  businessName: string;
  invoiceNumber: string;
  description: string | null;
  amount: string;
  currency: Currency;
  amountReceived: string;
  amountOutstanding: string;
  amountOverpaid: string;
  cryptoAsset: CryptoAsset;
  network: Network;
  address: string | null;
  status: InvoiceStatus;
  payable: boolean;
  dueDate: string | null;
  expiresAt: string | null;
  returnUrl: string | null;
  quote: PublicQuote | null;
  payments: PublicPaymentRecord[];
  display: PublicDisplay | null;
  serverTime: string;
}

// GET /pay/links/:reference
export interface PublicProductLink {
  reference: string;
  businessName: string;
  title: string;
  description: string | null;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  active: boolean;
  indicative: { cryptoAmount: string; rate: string; rateFetchedAt: string } | null;
}

export interface PayOptions {
  currencies: Currency[];
  paymentPairs: { cryptoAsset: CryptoAsset; network: Network }[];
}

// ---------- Checkouts (shop orders) as the API returns them ----------

export interface Checkout {
  id: string;
  paymentReference: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  amount: string;
  currency: Currency;
  amountReceived: string;
  amountOutstanding: string;
  amountOverpaid: string;
  cryptoAsset: CryptoAsset;
  network: Network;
  paymentAddress: string | null;
  orderId: string | null;
  description: string | null;
  buyerName: string | null;
  buyerEmail: string | null;
  returnUrl: string | null;
  expiresAt: string | null;
  productLinkId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckoutPayment extends PublicPaymentRecord {
  valuationRate: string | null;
}

export interface CheckoutDetail extends Checkout {
  payments: CheckoutPayment[];
}

// ---------- Summary (GET /businesses/:id/summary) ----------

export interface CurrencyTotals {
  currency: Currency;
  invoiceCount: number;
  totalInvoiced: string;
  totalReceived: string;
  totalOutstanding: string;
  totalOverpaid: string;
}

export interface BusinessSummary {
  displayCurrency: Currency;
  // null when a rate the total needs is unavailable
  totalInvoiced: string | null;
  totalReceived: string | null;
  totalOutstanding: string | null;
  ratesAsOf: string | null;
  byCurrency: CurrencyTotals[];
  invoiceCountByStatus: Record<InvoiceStatus, number>;
  unmatchedTransactionCount: number;
  unvaluedPaymentCount: number;
  recentTransactions: Transaction[];
}

// ---------- Inputs ----------

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateBusinessInput {
  businessName: string;
  businessEmail?: string;
  businessType?: string;
}

export interface CreateClientInput {
  name: string;
  email?: string;
}

export interface CreateInvoiceInput {
  clientId?: string;
  description?: string;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  dueDate: string; // ISO date-time
  status?: InvoiceStatus;
}

export interface CreateCheckoutInput {
  description?: string;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  buyerName?: string;
  buyerEmail?: string;
  orderId?: string;
  returnUrl?: string;
  expiresInMinutes?: number; // 5 to 43200, default 1440
}

export interface CreateProductLinkInput {
  title: string;
  description?: string;
  amount: string;
  currency: Currency;
  cryptoAsset: CryptoAsset;
  network: Network;
  returnUrl?: string;
}

export interface StartCheckoutInput {
  buyerName?: string;
  buyerEmail?: string;
}
