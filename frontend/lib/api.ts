// The one place the frontend talks to the TakeFlow API.
//
// NEXT_PUBLIC_API_URL        base URL including /api/v1 (default http://localhost:3000/api/v1)
// NEXT_PUBLIC_USE_MOCKS=true every call is answered by the sample data in
//                            lib/mock-api.ts and nothing goes over the network.
//
// The live client and the mock layer return the same types (lib/types.ts).

import { composeDashboard } from "./dashboard";
import { ApiError } from "./errors";
import { mockApi } from "./mock-api";
import { addDec, cmpDec, divDec, isZero } from "./money";
import { session } from "./session";
import {
  type AddressResponse,
  type ApiKey,
  type AuthResponse,
  type Business,
  type BusinessSummary,
  type Checkout,
  type CheckoutDetail,
  type Client,
  type CreateBusinessInput,
  type CreateCheckoutInput,
  type CreateClientInput,
  type CreatedApiKey,
  type CreateInvoiceInput,
  type CreateProductLinkInput,
  type Currency,
  type Dashboard,
  type Invoice,
  type InvoiceKind,
  type InvoicePayments,
  type InvoiceStatus,
  type LoginInput,
  type Paginated,
  type PayOptions,
  type ProductLink,
  type PublicPayment,
  type PublicProductLink,
  type RatesSnapshot,
  type ReconciliationStatus,
  type RegisterInput,
  type StartCheckoutInput,
  type Transaction,
  type User,
} from "./types";

export { ApiError, errorMessage } from "./errors";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1").replace(/\/+$/, "");
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export interface NavCounts {
  openInvoices: number;
  activeLinks: number;
  unmatched: number;
}

export interface InvoiceQuery {
  status?: InvoiceStatus;
  kind?: InvoiceKind; // omit for invoices and shop orders together
  limit?: number;
  offset?: number;
}

export interface TransactionQuery {
  status?: ReconciliationStatus;
  limit?: number;
  offset?: number;
}

export type ProductLinkPatch = Partial<CreateProductLinkInput> & { active?: boolean };

export interface TakeFlowApi {
  // auth
  register(input: RegisterInput): Promise<AuthResponse>;
  login(input: LoginInput): Promise<AuthResponse>;
  me(): Promise<User>;
  // businesses and clients
  listBusinesses(): Promise<Business[]>;
  createBusiness(input: CreateBusinessInput): Promise<Business>;
  updateBusiness(id: string, patch: Partial<CreateBusinessInput> & { quoteWindowMinutes?: number; shortfallToleranceBps?: number }): Promise<Business>;
  listClients(businessId: string): Promise<Client[]>;
  createClient(businessId: string, input: CreateClientInput): Promise<Client>;
  // invoices and shop orders (checkouts come back in the Invoice shape, kind CHECKOUT)
  listInvoices(businessId: string, query?: InvoiceQuery): Promise<Paginated<Invoice>>;
  getInvoice(businessId: string, id: string): Promise<Invoice>;
  createInvoice(businessId: string, input: CreateInvoiceInput): Promise<Invoice>;
  updateInvoice(businessId: string, id: string, patch: { status?: InvoiceStatus; dueDate?: string; description?: string }): Promise<Invoice>;
  assignAddress(businessId: string, invoiceId: string): Promise<AddressResponse>;
  getInvoicePayments(businessId: string, invoiceId: string): Promise<InvoicePayments>;
  // transactions
  listTransactions(businessId: string, query?: TransactionQuery): Promise<Paginated<Transaction>>;
  // dashboard
  getDashboard(businessId: string, currency: Currency): Promise<Dashboard>;
  getNavCounts(businessId: string): Promise<NavCounts>;
  getRates(): Promise<RatesSnapshot | null>;
  // personal display currency
  getDisplayCurrency(): Promise<Currency | null>;
  setDisplayCurrency(currency: Currency): Promise<Currency>;
  // checkout links
  listCheckouts(businessId: string): Promise<Invoice[]>;
  createCheckout(businessId: string, input: CreateCheckoutInput): Promise<Invoice>;
  listProductLinks(businessId: string): Promise<ProductLink[]>;
  createProductLink(businessId: string, input: CreateProductLinkInput): Promise<ProductLink>;
  updateProductLink(businessId: string, id: string, patch: ProductLinkPatch): Promise<ProductLink>;
  // website API keys
  listApiKeys(businessId: string): Promise<ApiKey[]>;
  createApiKey(businessId: string, name: string): Promise<CreatedApiKey>;
  revokeApiKey(businessId: string, id: string): Promise<void>;
  // public payment pages (no login)
  getPayOptions(): Promise<PayOptions>;
  getPayment(reference: string, displayCurrency?: Currency | null): Promise<PublicPayment>;
  requestQuote(reference: string, displayCurrency?: Currency | null): Promise<PublicPayment>;
  getProductLinkPage(reference: string): Promise<PublicProductLink>;
  startProductCheckout(reference: string, input: StartCheckoutInput): Promise<PublicPayment>;
}

// ---------- HTTP ----------

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  body?: unknown;
  query?: Query;
  auth?: boolean;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, query, auth = true } = opts;
  let url = API_URL + path;
  if (query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    const s = qs.toString();
    if (s) url += (url.includes("?") ? "&" : "?") + s;
  }
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = session.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" });
  } catch {
    throw new ApiError(0, "Can't reach TakeFlow right now. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // Errors look like {statusCode, message, path, timestamp}.
    const raw = (data as { message?: unknown } | null)?.message;
    const message = Array.isArray(raw) ? raw.join(". ") : typeof raw === "string" ? raw : res.statusText || "Something went wrong";
    const retry = Number(res.headers.get("Retry-After"));
    throw new ApiError(res.status, message, Number.isFinite(retry) && retry > 0 ? retry : undefined);
  }
  return data as T;
}

const enc = encodeURIComponent;
const biz = (id: string) => `/businesses/${enc(id)}`;
const is404 = (e: unknown) => e instanceof ApiError && e.status === 404;

// ---------- shape adapters ----------

export function checkoutToInvoice(c: Checkout, businessId: string, linkTitles?: Map<string, string>): Invoice {
  return {
    id: c.id,
    businessId,
    kind: "CHECKOUT",
    clientId: null,
    invoiceNumber: c.invoiceNumber,
    paymentReference: c.paymentReference,
    description: c.description,
    amount: c.amount,
    currency: c.currency,
    cryptoAsset: c.cryptoAsset,
    network: c.network,
    issueDate: c.createdAt,
    dueDate: c.expiresAt ?? c.createdAt,
    paymentAddress: c.paymentAddress,
    status: c.status,
    amountReceived: c.amountReceived,
    amountOutstanding: c.amountOutstanding,
    amountOverpaid: c.amountOverpaid,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    client: null,
    externalOrderId: c.orderId,
    buyerName: c.buyerName,
    buyerEmail: c.buyerEmail,
    returnUrl: c.returnUrl,
    expiresAt: c.expiresAt,
    productLinkId: c.productLinkId,
    productTitle: c.productLinkId ? linkTitles?.get(c.productLinkId) ?? c.description : null,
  };
}

function detailToPayments(d: CheckoutDetail, businessId: string): InvoicePayments {
  const invoice = checkoutToInvoice(d, businessId);
  const transactions: Transaction[] = d.payments.map((p) => ({
    id: p.transactionHash,
    businessId,
    invoiceId: d.id,
    transactionHash: p.transactionHash,
    receivingAddress: d.paymentAddress ?? "",
    senderAddress: null,
    asset: p.asset,
    network: p.network,
    amount: p.amount,
    excessAmount: "0",
    reconciliationStatus: "MATCHED",
    occurredAt: p.depositedAt ?? p.receivedAt,
    createdAt: p.receivedAt,
    updatedAt: p.receivedAt,
    invoice: { id: d.id, invoiceNumber: d.invoiceNumber, status: d.status, kind: "CHECKOUT", externalOrderId: d.orderId },
    depositedAt: p.depositedAt,
    valueCurrency: (p.valueCurrency as Currency | null) ?? null,
    valueAmount: p.valueAmount,
    valuationRate: p.valuationRate,
    valuationMethod: p.valuationMethod,
  }));
  return { invoice, transactions, totalReceived: d.amountReceived, amountOutstanding: d.amountOutstanding, paymentCount: transactions.length };
}

// ---------- live API ----------

type RawProductLink = Omit<ProductLink, "salesCount" | "totalReceived">;

async function allCheckouts(b: string, status?: InvoiceStatus): Promise<Checkout[]> {
  const res = await request<Paginated<Checkout>>("GET", `${biz(b)}/checkouts`, { query: { limit: 200, status } });
  return res.data;
}

async function rawLinks(b: string): Promise<RawProductLink[]> {
  return request<RawProductLink[]>("GET", `${biz(b)}/product-links`);
}

// Sales per product link, from its checkouts.
function withStats(links: RawProductLink[], checkouts: Checkout[]): ProductLink[] {
  return links.map((l) => {
    const mine = checkouts.filter((c) => c.productLinkId === l.id);
    const total = mine.reduce((acc, c) => addDec(acc, c.amountReceived), "0");
    return { ...l, salesCount: mine.filter((c) => c.status === "PAID").length, totalReceived: total };
  });
}

// Both kinds, enriched so payment rows can show who paid.
async function receivables(b: string): Promise<{ invoices: Invoice[]; links: RawProductLink[] }> {
  const [inv, chk, links] = await Promise.all([
    request<Paginated<Invoice>>("GET", `${biz(b)}/invoices`, { query: { limit: 200 } }),
    allCheckouts(b),
    rawLinks(b).catch(() => [] as RawProductLink[]),
  ]);
  const titles = new Map(links.map((l) => [l.id, l.title]));
  return { invoices: [...inv.data.map((i) => ({ ...i, kind: i.kind ?? ("INVOICE" as const) })), ...chk.map((c) => checkoutToInvoice(c, b, titles))], links };
}

function enrich(txs: Transaction[], invoices: Invoice[]): Transaction[] {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  return txs.map((t) => {
    const inv = t.invoiceId ? byId.get(t.invoiceId) : undefined;
    if (!inv || !t.invoice) return t;
    return {
      ...t,
      invoice: {
        ...t.invoice,
        kind: inv.kind,
        clientName: inv.client?.name ?? null,
        externalOrderId: inv.externalOrderId ?? null,
        productTitle: inv.productTitle ?? inv.description ?? null,
      },
    };
  });
}

// Rates for converting other currencies on the dashboard. The API has no
// rates route yet, so they are read from the payment page's own display
// conversion (one public read per currency). Coin prices stay unknown.
let rateCache: { key: string; at: number; rates: RatesSnapshot | null } | null = null;
async function displayRates(display: Currency, items: Invoice[], ratesAsOf: string | null): Promise<RatesSnapshot | null> {
  const others = Array.from(new Set(items.filter((i) => i.status !== "DRAFT").map((i) => i.currency))).filter((c) => c !== display);
  const key = display + ":" + others.sort().join(",");
  if (rateCache && rateCache.key === key && Date.now() - rateCache.at < 60_000) return rateCache.rates;
  const perUsd = { [display]: "1" } as Record<Currency, string>; // relative to the display currency
  for (const c of others) {
    // The largest amount keeps rounding in the display value smallest.
    const sample = items.filter((i) => i.currency === c && i.status !== "DRAFT").sort((a, b) => cmpDec(b.amount, a.amount))[0];
    if (!sample) continue;
    try {
      const p = await request<PublicPayment>("GET", `/pay/${enc(sample.paymentReference)}`, { auth: false, query: { currency: display } });
      if (p.display && !isZero(p.display.amount)) perUsd[c] = divDec(p.amount, p.display.amount);
    } catch {
      // that currency stays unconverted: its totals read "Rate unavailable"
    }
  }
  const complete = others.every((c) => perUsd[c]);
  const rates: RatesSnapshot | null = others.length === 0 || complete ? { fetchedAt: ratesAsOf ?? new Date().toISOString(), perUsd, coins: {} as RatesSnapshot["coins"] } : null;
  rateCache = { key, at: Date.now(), rates };
  return rates;
}

const liveApi: TakeFlowApi = {
  register: (input) => request("POST", "/auth/register", { body: input, auth: false }),
  login: (input) => request("POST", "/auth/login", { body: input, auth: false }),
  me: () => request("GET", "/auth/me"),

  listBusinesses: () => request("GET", "/businesses"),
  createBusiness: (input) => request("POST", "/businesses", { body: input }),
  updateBusiness: (id, patch) => request("PATCH", `/businesses/${enc(id)}`, { body: patch }),
  listClients: (b) => request("GET", `${biz(b)}/clients`),
  createClient: (b, input) => request("POST", `${biz(b)}/clients`, { body: input }),

  async listInvoices(b, q = {}) {
    if (q.kind === "INVOICE") return request("GET", `${biz(b)}/invoices`, { query: { limit: 200, ...q, kind: undefined } as Query });
    if (q.kind === "CHECKOUT") {
      const [chk, links] = await Promise.all([allCheckouts(b, q.status), rawLinks(b).catch(() => [] as RawProductLink[])]);
      const titles = new Map(links.map((l) => [l.id, l.title]));
      const data = chk.map((c) => checkoutToInvoice(c, b, titles));
      return { data, total: data.length, limit: 200, offset: 0 };
    }
    const { invoices } = await receivables(b);
    const data = invoices.filter((i) => !q.status || i.status === q.status).sort((x, y) => y.issueDate.localeCompare(x.issueDate));
    return { data, total: data.length, limit: 400, offset: 0 };
  },

  async getInvoice(b, id) {
    try {
      return await request<Invoice>("GET", `${biz(b)}/invoices/${enc(id)}`);
    } catch (e) {
      if (!is404(e)) throw e;
      return checkoutToInvoice(await request<Checkout>("GET", `${biz(b)}/checkouts/${enc(id)}`), b);
    }
  },
  createInvoice: (b, input) => request("POST", `${biz(b)}/invoices`, { body: input }),
  updateInvoice: (b, id, patch) => request("PATCH", `${biz(b)}/invoices/${enc(id)}`, { body: patch }),
  assignAddress: (b, id) => request("POST", `${biz(b)}/invoices/${enc(id)}/address`),

  async getInvoicePayments(b, id) {
    try {
      const res = await request<InvoicePayments>("GET", `${biz(b)}/invoices/${enc(id)}/payments`);
      return { ...res, invoice: { ...res.invoice, kind: res.invoice.kind ?? "INVOICE" } };
    } catch (e) {
      if (!is404(e)) throw e;
      return detailToPayments(await request<CheckoutDetail>("GET", `${biz(b)}/checkouts/${enc(id)}`), b);
    }
  },

  async listTransactions(b, q = {}) {
    const [res, all] = await Promise.all([
      request<Paginated<Transaction>>("GET", `${biz(b)}/transactions`, { query: { limit: 200, ...q } as Query }),
      receivables(b).catch(() => ({ invoices: [] as Invoice[], links: [] })),
    ]);
    return { ...res, data: enrich(res.data, all.invoices) };
  },

  async getDashboard(b, currency) {
    const [summary, all, txs, checkouts] = await Promise.all([
      request<BusinessSummary>("GET", `${biz(b)}/summary`, { query: { currency } }),
      receivables(b),
      request<Paginated<Transaction>>("GET", `${biz(b)}/transactions`, { query: { limit: 200 } }),
      allCheckouts(b),
    ]);
    const rates = await liveApi.getRates().then((r) => r ?? displayRates(currency, all.invoices, summary.ratesAsOf));
    return composeDashboard({
      currency,
      now: new Date(),
      invoices: all.invoices,
      transactions: enrich(txs.data, all.invoices),
      productLinks: withStats(all.links, checkouts),
      rates,
      ratesAsOf: summary.ratesAsOf,
      periodDays: null, // the summary covers everything, not a date range
      serverTotals: { invoiced: summary.totalInvoiced, received: summary.totalReceived, outstanding: summary.totalOutstanding },
    });
  },

  async getNavCounts(b) {
    const [s, links] = await Promise.all([request<BusinessSummary>("GET", `${biz(b)}/summary`), rawLinks(b).catch(() => [] as RawProductLink[])]);
    const c = s.invoiceCountByStatus ?? ({} as Record<InvoiceStatus, number>);
    return {
      openInvoices: (c.PENDING ?? 0) + (c.PARTIALLY_PAID ?? 0) + (c.OVERDUE ?? 0),
      activeLinks: links.filter((l) => l.active).length,
      unmatched: s.unmatchedTransactionCount ?? 0,
    };
  },

  // The API has no rates route yet. Kept so a future GET /rates is picked up.
  async getRates() {
    try {
      return await request<RatesSnapshot>("GET", "/rates", { auth: false });
    } catch {
      return null;
    }
  },

  async getDisplayCurrency() {
    const me = await request<User>("GET", "/auth/me");
    return me.displayCurrency ?? null;
  },
  async setDisplayCurrency(currency) {
    const me = await request<User>("PATCH", "/auth/me", { body: { displayCurrency: currency } });
    return me.displayCurrency ?? currency;
  },

  async listCheckouts(b) {
    const chk = await allCheckouts(b);
    return chk.filter((c) => !c.productLinkId).map((c) => checkoutToInvoice(c, b));
  },
  async createCheckout(b, input) {
    return checkoutToInvoice(await request<Checkout>("POST", `${biz(b)}/checkouts`, { body: input }), b);
  },
  async listProductLinks(b) {
    const [links, chk] = await Promise.all([rawLinks(b), allCheckouts(b).catch(() => [] as Checkout[])]);
    return withStats(links, chk);
  },
  async createProductLink(b, input) {
    const l = await request<RawProductLink>("POST", `${biz(b)}/product-links`, { body: input });
    return { ...l, salesCount: 0, totalReceived: "0" };
  },
  async updateProductLink(b, id, patch) {
    const [l, chk] = await Promise.all([request<RawProductLink>("PATCH", `${biz(b)}/product-links/${enc(id)}`, { body: patch }), allCheckouts(b).catch(() => [] as Checkout[])]);
    return withStats([l], chk)[0];
  },

  listApiKeys: (b) => request("GET", `${biz(b)}/api-keys`),
  createApiKey: (b, name) => request("POST", `${biz(b)}/api-keys`, { body: { name } }),
  revokeApiKey: (b, id) => request("DELETE", `${biz(b)}/api-keys/${enc(id)}`),

  getPayOptions: () => request("GET", "/pay/options", { auth: false }),
  getPayment: (ref, currency) => request("GET", `/pay/${enc(ref)}`, { auth: false, query: { currency } }),
  requestQuote: (ref, currency) => request("POST", `/pay/${enc(ref)}/quote`, { auth: false, query: { currency } }),
  getProductLinkPage: (ref) => request("GET", `/pay/links/${enc(ref)}`, { auth: false }),
  startProductCheckout: (ref, input) => request("POST", `/pay/links/${enc(ref)}/checkouts`, { body: input, auth: false }),
};

export const api: TakeFlowApi = USE_MOCKS ? mockApi : liveApi;
