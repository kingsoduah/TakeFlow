// Sample-data implementation of the API, used when NEXT_PUBLIC_USE_MOCKS=true.
// Same shapes and the same errors the real API returns, kept in this browser.

import type { NavCounts, TakeFlowApi } from "./api";
import { composeDashboard, type DashboardHistory } from "./dashboard";
import { ApiError } from "./errors";
import { addDec, cmpDec, mulDec, roundDec, subDec } from "./money";
import {
  MOCK_COIN_USD,
  MOCK_PER_USD,
  coinRate,
  convertMock,
  cryptoFor,
  getDb,
  makeTx,
  maxZero,
  mockAddress,
  mockApiKeySecret,
  mockPayRef,
  mockRatesFetchedAt,
  mockUuid,
  saveDb,
  statusFor,
  type MockDb,
} from "./mock-db";
import { session } from "./session";
import {
  CURRENCIES,
  PAYMENT_PAIRS,
  type Currency,
  type DashboardSeriesPoint,
  type Invoice,
  type ProductLink,
  type PublicPayment,
  type PublicQuote,
  type RatesSnapshot,
  type User,
} from "./types";

const wait = (ms = 160 + Math.random() * 140) => new Promise((r) => setTimeout(r, ms));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const nowIso = () => new Date().toISOString();

function currentUser(db: MockDb): User & { password: string } {
  const token = session.getToken();
  const id = token?.startsWith("mock.") ? token.slice(5) : null;
  const user = id ? db.users.find((u) => u.id === id) : undefined;
  if (!user) throw new ApiError(401, "Please sign in again.");
  return user;
}

function ownBusiness(db: MockDb, businessId: string) {
  const user = currentUser(db);
  const b = db.businesses.find((x) => x.id === businessId && x.ownerId === user.id);
  if (!b) throw new ApiError(404, "Business not found");
  return b;
}

function publicUser(u: User & { password: string }): User {
  const { password: _password, ...rest } = u;
  void _password;
  return rest;
}

// Statuses that move with time (overdue, expired) are refreshed on read.
function refresh(db: MockDb) {
  const now = new Date();
  let changed = false;
  for (const inv of db.invoices) {
    if (inv.status === "DRAFT" || inv.status === "PAID") continue;
    const next = statusFor(inv, now);
    if (next !== inv.status) {
      inv.status = next;
      changed = true;
    }
  }
  if (changed) saveDb();
}

function rates(): RatesSnapshot {
  return { fetchedAt: mockRatesFetchedAt(), perUsd: { ...MOCK_PER_USD }, coins: { ...MOCK_COIN_USD } };
}

function linkStats(db: MockDb, linkId: string, currency: Currency) {
  const checkouts = db.invoices.filter((i) => i.productLinkId === linkId);
  const ids = new Set(checkouts.map((c) => c.id));
  const total = db.transactions
    .filter((t) => t.reconciliationStatus === "MATCHED" && t.invoiceId && ids.has(t.invoiceId) && t.valueCurrency === currency)
    .reduce((a, t) => addDec(a, t.valueAmount ?? "0"), "0");
  return { salesCount: checkouts.filter((c) => c.status === "PAID").length, totalReceived: roundDec(total) };
}

function withStats(db: MockDb, l: MockDb["productLinks"][number]): ProductLink {
  return { ...clone(l), ...linkStats(db, l.id, l.currency) };
}

function nextNumber(db: MockDb, businessId: string) {
  const n = db.invoiceCounter[businessId] ?? 1001;
  db.invoiceCounter[businessId] = n + 1;
  return `INV-${n}`;
}

// ---------- synthetic history for the sample business ----------

function seriesFrom(n: number, total: number, seed: number, zeroP: number): number[] {
  let s = seed;
  const r = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const raw: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const v = r() < zeroP ? 0 : 0.3 + r() * 1.7;
    raw.push(v);
    sum += v;
  }
  const cents = raw.map((v) => Math.round((v / sum) * total * 100));
  const diff = Math.round(total * 100) - cents.reduce((a, b) => a + b, 0);
  for (let i = n - 1; i >= 0; i--)
    if (cents[i] > 0) {
      cents[i] += diff;
      break;
    }
  return cents;
}

const OWED_USD = [14980, 15240, 15100, 14720, 14900, 14310, 14650, 14420, 14980, 14200, 13940, 14380, 14610, 14150, 13620, 13890, 14300, 13870, 13210, 13680, 14020, 13540, 13360, 13100, 13550, 13240, 12890, 13120, 12980, 12760.79];

function sampleHistory(currency: Currency): DashboardHistory {
  const rate = MOCK_PER_USD[currency];
  const toCcy = (usdCents: number) => roundDec(mulDec((usdCents / 100).toFixed(2), rate));
  const rec = [...seriesFrom(30, 27860, 11, 0.4), ...seriesFrom(30, 31240, 23, 0.4)];
  const inv = [...seriesFrom(30, 41200, 5, 0.5), ...seriesFrom(30, 44910, 7, 0.5)];
  const today = new Date();
  const olderSeries: DashboardSeriesPoint[] = rec.map((cents, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (89 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { date: key, received: toCcy(cents), invoiced: toCcy(inv[i]) };
  });
  return {
    olderSeries,
    previous: {
      invoiced: roundDec(mulDec("44910", rate)),
      received: roundDec(mulDec("31240", rate)),
      outstanding: roundDec(mulDec("14980", rate)),
      paymentsMatched: 30,
      overdueCount: 3,
    },
    outstandingSeries: OWED_USD.map((v) => roundDec(mulDec(v.toFixed(2), rate))),
  };
}

// ---------- quotes ----------

// The running quote, while it is in its window and still matches what is
// owed. Like the API, reading the page never makes a quote.
function activeQuote(db: MockDb, inv: Invoice): PublicQuote | null {
  const q = db.quotes[inv.id];
  if (!q) return null;
  if (new Date(q.expiresAt).getTime() <= Date.now()) return null;
  if (cmpDec(q.amountDue, inv.amountOutstanding) !== 0) return null;
  return q;
}

function newQuote(db: MockDb, inv: Invoice): PublicQuote {
  const business = db.businesses.find((b) => b.id === inv.businessId);
  const minutes = Math.min(5, Math.max(2, business?.quoteWindowMinutes ?? 5));
  const created = new Date();
  const q: PublicQuote = {
    cryptoAsset: inv.cryptoAsset,
    network: inv.network,
    priceCurrency: inv.currency,
    amountDue: inv.amountOutstanding,
    rate: coinRate(inv.cryptoAsset, inv.currency),
    cryptoAmount: cryptoFor(inv.amountOutstanding, inv.cryptoAsset, inv.currency),
    rateFetchedAt: mockRatesFetchedAt(created),
    createdAt: created.toISOString(),
    expiresAt: new Date(created.getTime() + minutes * 60_000).toISOString(),
  };
  db.quotes[inv.id] = q;
  saveDb();
  return q;
}

const isOpen = (inv: Invoice) => inv.status === "PENDING" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE";

function publicPayment(db: MockDb, inv: Invoice, display?: Currency | null): PublicPayment {
  const business = db.businesses.find((b) => b.id === inv.businessId);
  const payable = isOpen(inv) && !(inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now());
  const payments = db.transactions
    .filter((t) => t.invoiceId === inv.id && t.reconciliationStatus === "MATCHED")
    .sort((a, b) => (a.occurredAt ?? "").localeCompare(b.occurredAt ?? ""))
    .map((t) => ({
      transactionHash: t.transactionHash,
      asset: t.asset,
      network: t.network,
      amount: t.amount,
      valueAmount: t.valueAmount ?? null,
      valueCurrency: t.valueCurrency ?? null,
      valuationMethod: t.valuationMethod ?? null,
      depositedAt: t.occurredAt ?? null,
      receivedAt: t.createdAt,
    }));
  const conv = (v: string) => roundDec(convertMock(v, inv.currency, display as Currency));
  return {
    kind: inv.kind ?? "INVOICE",
    paymentReference: inv.paymentReference,
    businessName: business?.businessName ?? "",
    invoiceNumber: inv.invoiceNumber,
    description: inv.description ?? null,
    amount: inv.amount,
    currency: inv.currency,
    amountReceived: inv.amountReceived,
    amountOutstanding: inv.amountOutstanding,
    amountOverpaid: inv.amountOverpaid ?? "0",
    cryptoAsset: inv.cryptoAsset,
    network: inv.network,
    address: inv.paymentAddress ?? null,
    status: inv.status,
    payable,
    dueDate: inv.kind === "CHECKOUT" ? null : inv.dueDate,
    expiresAt: inv.expiresAt ?? null,
    returnUrl: inv.returnUrl ?? null,
    quote: payable ? activeQuote(db, inv) : null,
    payments,
    display: display ? { currency: display, amount: conv(inv.amount), amountReceived: conv(inv.amountReceived), amountOutstanding: conv(inv.amountOutstanding), rateFetchedAt: mockRatesFetchedAt() } : null,
    serverTime: nowIso(),
  };
}

function findByReference(db: MockDb, reference: string) {
  const inv = db.invoices.find((i) => i.paymentReference === reference);
  // Drafts are not public, the same as unknown references.
  if (!inv || inv.status === "DRAFT") throw new ApiError(404, "We could not find this payment link.");
  return inv;
}

// ---------- the API ----------

export const mockApi: TakeFlowApi = {
  async register(input) {
    await wait();
    const db = getDb();
    if (db.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase())) {
      throw new ApiError(409, "That email is already registered. Sign in instead.");
    }
    const user = { id: mockUuid(), fullName: input.fullName, email: input.email.toLowerCase(), password: input.password, displayCurrency: null, createdAt: nowIso(), updatedAt: nowIso() };
    db.users.push(user);
    saveDb();
    return { user: publicUser(user), accessToken: `mock.${user.id}` };
  },

  async login(input) {
    await wait();
    const db = getDb();
    const existing = db.users.find((u) => u.email.toLowerCase() === input.email.toLowerCase());
    if (existing && existing.password && existing.password !== input.password) {
      throw new ApiError(401, "That email and password don't match.");
    }
    // With sample data, any other email signs in to the sample business.
    const user = existing ?? db.users[0];
    return { user: publicUser(user), accessToken: `mock.${user.id}` };
  },

  async me() {
    await wait(60);
    return publicUser(currentUser(getDb()));
  },

  async listBusinesses() {
    await wait();
    const db = getDb();
    const user = currentUser(db);
    return clone(db.businesses.filter((b) => b.ownerId === user.id));
  },

  async createBusiness(input) {
    await wait();
    const db = getDb();
    const user = currentUser(db);
    const b = {
      id: mockUuid(),
      ownerId: user.id,
      businessName: input.businessName,
      businessEmail: input.businessEmail ?? null,
      businessType: input.businessType ?? null,
      quoteWindowMinutes: 5,
      shortfallToleranceBps: 50,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.businesses.push(b);
    db.invoiceCounter[b.id] = 1001;
    saveDb();
    return clone(b);
  },

  async updateBusiness(id, patch) {
    await wait();
    const db = getDb();
    const b = ownBusiness(db, id);
    if (patch.quoteWindowMinutes !== undefined && (patch.quoteWindowMinutes < 2 || patch.quoteWindowMinutes > 5)) throw new ApiError(400, "The price hold must be 2 to 5 minutes.");
    Object.assign(b, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), { updatedAt: nowIso() });
    saveDb();
    return clone(b);
  },

  async listClients(businessId) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    return clone(db.clients.filter((c) => c.businessId === businessId).sort((a, b) => a.name.localeCompare(b.name)));
  },

  async createClient(businessId, input) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    const c = { id: mockUuid(), businessId, name: input.name, email: input.email ?? null, createdAt: nowIso(), updatedAt: nowIso() };
    db.clients.push(c);
    saveDb();
    return clone(c);
  },

  async listInvoices(businessId, q = {}) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    let list = db.invoices.filter((i) => i.businessId === businessId);
    if (q.status) list = list.filter((i) => i.status === q.status);
    if (q.kind) list = list.filter((i) => (i.kind ?? "INVOICE") === q.kind);
    list = [...list].sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    return { data: clone(list.slice(offset, offset + limit)), total: list.length, limit, offset };
  },

  async getInvoice(businessId, id) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    const inv = db.invoices.find((i) => i.id === id && i.businessId === businessId);
    if (!inv) throw new ApiError(404, "Invoice not found");
    return clone(inv);
  },

  async createInvoice(businessId, input) {
    await wait(320);
    const db = getDb();
    ownBusiness(db, businessId);
    const client = input.clientId ? db.clients.find((c) => c.id === input.clientId && c.businessId === businessId) : null;
    if (input.clientId && !client) throw new ApiError(404, "Client not found");
    const created = nowIso();
    const inv: Invoice = {
      id: mockUuid(),
      businessId,
      kind: "INVOICE",
      clientId: client?.id ?? null,
      invoiceNumber: nextNumber(db, businessId),
      paymentReference: mockPayRef(),
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency,
      cryptoAsset: input.cryptoAsset,
      network: input.network,
      issueDate: created,
      dueDate: input.dueDate,
      paymentAddress: null,
      status: input.status ?? "DRAFT",
      amountReceived: "0",
      amountOutstanding: input.amount,
      amountOverpaid: "0",
      createdAt: created,
      updatedAt: created,
      client: client ? { id: client.id, name: client.name, email: client.email } : null,
    };
    db.invoices.push(inv);
    saveDb();
    return clone(inv);
  },

  async updateInvoice(businessId, id, patch) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    const inv = db.invoices.find((i) => i.id === id && i.businessId === businessId);
    if (!inv) throw new ApiError(404, "Invoice not found");
    if (patch.status === "PAID" || patch.status === "PARTIALLY_PAID") throw new ApiError(400, "Payment status comes from payments, not edits.");
    if (patch.description !== undefined) inv.description = patch.description;
    if (patch.dueDate) inv.dueDate = patch.dueDate;
    if (patch.status) inv.status = patch.status;
    inv.updatedAt = nowIso();
    saveDb();
    return clone(inv);
  },

  async assignAddress(businessId, invoiceId) {
    await wait(380);
    const db = getDb();
    ownBusiness(db, businessId);
    const inv = db.invoices.find((i) => i.id === invoiceId && i.businessId === businessId);
    if (!inv) throw new ApiError(404, "Invoice not found");
    const reused = !!inv.paymentAddress;
    if (!inv.paymentAddress) {
      inv.paymentAddress = mockAddress(inv.network);
      saveDb();
    }
    return { address: inv.paymentAddress, network: inv.network, reused };
  },

  async getInvoicePayments(businessId, invoiceId) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    const inv = db.invoices.find((i) => i.id === invoiceId && i.businessId === businessId);
    if (!inv) throw new ApiError(404, "Invoice not found");
    const txs = db.transactions
      .filter((t) => t.invoiceId === inv.id)
      .sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
    return { invoice: clone(inv), transactions: clone(txs), totalReceived: inv.amountReceived, amountOutstanding: inv.amountOutstanding, paymentCount: txs.length };
  },

  async listTransactions(businessId, q = {}) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    let list = db.transactions.filter((t) => t.businessId === businessId);
    if (q.status) list = list.filter((t) => t.reconciliationStatus === q.status);
    list = [...list].sort((a, b) => (b.occurredAt ?? b.createdAt).localeCompare(a.occurredAt ?? a.createdAt));
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 50;
    return { data: clone(list.slice(offset, offset + limit)), total: list.length, limit, offset };
  },

  async getDashboard(businessId, currency) {
    await wait(260);
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    const isSample = db.businesses[0]?.id === businessId;
    return composeDashboard({
      currency,
      now: new Date(),
      invoices: clone(db.invoices.filter((i) => i.businessId === businessId)),
      transactions: clone(db.transactions.filter((t) => t.businessId === businessId)),
      productLinks: db.productLinks.filter((l) => l.businessId === businessId).map((l) => withStats(db, l)),
      rates: rates(),
      periodDays: 30,
      history: isSample ? sampleHistory(currency) : undefined,
    });
  },

  async getNavCounts(businessId): Promise<NavCounts> {
    await wait(80);
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    const inv = db.invoices.filter((i) => i.businessId === businessId);
    return {
      openInvoices: inv.filter((i) => i.status === "PENDING" || i.status === "PARTIALLY_PAID" || i.status === "OVERDUE").length,
      activeLinks: db.productLinks.filter((l) => l.businessId === businessId && l.active).length,
      unmatched: db.transactions.filter((t) => t.businessId === businessId && t.reconciliationStatus === "UNMATCHED").length,
    };
  },

  async getRates() {
    await wait(60);
    return rates();
  },

  async getDisplayCurrency() {
    await wait(40);
    return currentUser(getDb()).displayCurrency ?? null;
  },

  async setDisplayCurrency(currency) {
    await wait(80);
    const db = getDb();
    const u = currentUser(db);
    u.displayCurrency = currency;
    saveDb();
    return currency;
  },

  async listCheckouts(businessId) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    refresh(db);
    return clone(
      db.invoices
        .filter((i) => i.businessId === businessId && i.kind === "CHECKOUT" && !i.productLinkId)
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    );
  },

  async createCheckout(businessId, input) {
    await wait(320);
    const db = getDb();
    ownBusiness(db, businessId);
    // Sending the same order ID twice returns the same checkout.
    if (input.orderId) {
      const same = db.invoices.find((i) => i.businessId === businessId && i.externalOrderId === input.orderId);
      if (same) return clone(same);
    }
    const created = new Date();
    const minutes = Math.min(43_200, Math.max(5, input.expiresInMinutes ?? 1440));
    const expires = new Date(created.getTime() + minutes * 60_000).toISOString();
    const inv: Invoice = {
      id: mockUuid(),
      businessId,
      kind: "CHECKOUT",
      clientId: null,
      invoiceNumber: nextNumber(db, businessId),
      paymentReference: mockPayRef(),
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency,
      cryptoAsset: input.cryptoAsset,
      network: input.network,
      issueDate: created.toISOString(),
      dueDate: expires,
      paymentAddress: null, // made on the first quote, as the API does
      status: "PENDING",
      amountReceived: "0",
      amountOutstanding: input.amount,
      amountOverpaid: "0",
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
      client: null,
      externalOrderId: input.orderId ?? null,
      buyerName: input.buyerName ?? null,
      buyerEmail: input.buyerEmail ?? null,
      returnUrl: input.returnUrl ?? null,
      expiresAt: expires,
      productLinkId: null,
      productTitle: null,
    };
    db.invoices.push(inv);
    saveDb();
    return clone(inv);
  },

  async listProductLinks(businessId) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    return db.productLinks
      .filter((l) => l.businessId === businessId)
      .sort((a, b) => Number(b.active) - Number(a.active) || b.createdAt.localeCompare(a.createdAt))
      .map((l) => withStats(db, l));
  },

  async createProductLink(businessId, input) {
    await wait(300);
    const db = getDb();
    ownBusiness(db, businessId);
    const l = {
      id: mockUuid(),
      businessId,
      reference: "link_" + mockPayRef().slice(4),
      title: input.title,
      description: input.description ?? null,
      amount: input.amount,
      currency: input.currency,
      cryptoAsset: input.cryptoAsset,
      network: input.network,
      returnUrl: input.returnUrl ?? null,
      active: true,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.productLinks.push(l);
    saveDb();
    return withStats(db, l);
  },

  async updateProductLink(businessId, id, patch) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    const l = db.productLinks.find((x) => x.id === id && x.businessId === businessId);
    if (!l) throw new ApiError(404, "Link not found");
    Object.assign(l, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
    l.updatedAt = nowIso();
    saveDb();
    return withStats(db, l);
  },

  async listApiKeys(businessId) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    return clone(
      db.apiKeys
        .filter((k) => k.businessId === businessId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ businessId: _b, ...k }) => {
          void _b;
          return k;
        }),
    );
  },

  async createApiKey(businessId, name) {
    await wait(300);
    const db = getDb();
    ownBusiness(db, businessId);
    const { prefix, key } = mockApiKeySecret();
    const k = { id: mockUuid(), businessId, name, prefix, lastUsedAt: null, revokedAt: null, createdAt: nowIso() };
    db.apiKeys.push(k);
    saveDb();
    const { businessId: _b, ...rest } = k;
    void _b;
    return { ...rest, key };
  },

  async revokeApiKey(businessId, id) {
    await wait();
    const db = getDb();
    ownBusiness(db, businessId);
    const k = db.apiKeys.find((x) => x.id === id && x.businessId === businessId);
    if (!k) throw new ApiError(404, "Key not found");
    if (!k.revokedAt) k.revokedAt = nowIso();
    saveDb();
  },

  async getPayOptions() {
    await wait(60);
    return { currencies: [...CURRENCIES], paymentPairs: PAYMENT_PAIRS.map((p) => ({ cryptoAsset: p.cryptoAsset, network: p.network })) };
  },

  // GET /pay/:ref: read only, never makes a quote or an address.
  async getPayment(reference, display) {
    await wait(140);
    const db = getDb();
    refresh(db);
    return publicPayment(db, findByReference(db, reference), display);
  },

  // Sample data has its own controls (mockTools); this keeps the API shape.
  async simulatePayment(reference, portion, display) {
    mockTools.simulatePayment(reference, portion);
    return mockApi.getPayment(reference, display);
  },

  // POST /pay/:ref/quote: reuses the running quote while it still matches
  // what is owed, otherwise makes a new one. Makes the address on first use.
  async requestQuote(reference, display) {
    await wait(220);
    const db = getDb();
    refresh(db);
    const inv = findByReference(db, reference);
    if (inv.status === "PAID" || cmpDec(inv.amountOutstanding, "0") <= 0) throw new ApiError(409, "This payment is already complete.");
    if (inv.status === "EXPIRED" || (inv.expiresAt && new Date(inv.expiresAt).getTime() < Date.now())) throw new ApiError(410, "This checkout has expired.");
    if (!inv.paymentAddress) {
      inv.paymentAddress = mockAddress(inv.network);
      saveDb();
    }
    if (!activeQuote(db, inv)) newQuote(db, inv);
    return publicPayment(db, inv, display);
  },

  async getProductLinkPage(reference) {
    await wait(140);
    const db = getDb();
    const l = db.productLinks.find((x) => x.reference === reference);
    if (!l) throw new ApiError(404, "We could not find this payment link.");
    const b = db.businesses.find((x) => x.id === l.businessId);
    return {
      reference: l.reference,
      businessName: b?.businessName ?? "",
      title: l.title,
      description: l.description ?? null,
      amount: l.amount,
      currency: l.currency,
      cryptoAsset: l.cryptoAsset,
      network: l.network,
      active: l.active,
      indicative: { cryptoAmount: cryptoFor(l.amount, l.cryptoAsset, l.currency), rate: coinRate(l.cryptoAsset, l.currency), rateFetchedAt: mockRatesFetchedAt() },
    };
  },

  async startProductCheckout(reference, input) {
    await wait(420);
    const db = getDb();
    const l = db.productLinks.find((x) => x.reference === reference);
    if (!l) throw new ApiError(404, "We could not find this payment link.");
    if (!l.active) throw new ApiError(410, "This link is turned off. Ask the shop for a new one.");
    const created = new Date();
    const expires = new Date(created.getTime() + 24 * 3_600_000).toISOString();
    const inv: Invoice = {
      id: mockUuid(),
      businessId: l.businessId,
      kind: "CHECKOUT",
      clientId: null,
      invoiceNumber: nextNumber(db, l.businessId),
      paymentReference: mockPayRef(),
      description: l.title,
      amount: l.amount,
      currency: l.currency,
      cryptoAsset: l.cryptoAsset,
      network: l.network,
      issueDate: created.toISOString(),
      dueDate: expires,
      paymentAddress: null, // made on the first quote, when the buyer is ready to pay
      status: "PENDING",
      amountReceived: "0",
      amountOutstanding: l.amount,
      amountOverpaid: "0",
      createdAt: created.toISOString(),
      updatedAt: created.toISOString(),
      client: null,
      externalOrderId: null,
      buyerName: input.buyerName || null,
      buyerEmail: input.buyerEmail || null,
      returnUrl: l.returnUrl ?? null,
      expiresAt: expires,
      productLinkId: l.id,
      productTitle: l.title,
    };
    db.invoices.push(inv);
    saveDb();
    return publicPayment(db, inv, null);
  },
};

// Sample-data only: lets the team walk the payment page through its states
// without a real transfer. Never shown when the real API is in use.
export const mockTools = {
  simulatePayment(reference: string, kind: "part" | "full") {
    const db = getDb();
    const inv = db.invoices.find((i) => i.paymentReference === reference);
    if (!inv || inv.status === "PAID") return;
    const q = activeQuote(db, inv) ?? newQuote(db, inv);
    const crypto = kind === "full" ? q.cryptoAmount : roundDec(mulDec(q.cryptoAmount, "0.45"));
    const raw = mulDec(crypto, q.rate);
    const value = cmpDec(raw, inv.amountOutstanding) > 0 ? inv.amountOutstanding : raw;
    inv.amountReceived = addDec(inv.amountReceived, value);
    inv.amountOutstanding = maxZero(subDec(inv.amount, inv.amountReceived));
    inv.status = statusFor(inv);
    inv.updatedAt = nowIso();
    const client = inv.clientId ? db.clients.find((c) => c.id === inv.clientId) : null;
    const tx = makeTx(inv, client?.name ?? null, { crypto, value, rate: q.rate, occurredAt: nowIso(), network: inv.network, asset: inv.cryptoAsset });
    db.transactions.unshift(tx);
    if (kind === "full") delete db.quotes[inv.id];
    saveDb();
  },
  expireQuote(reference: string) {
    const db = getDb();
    const inv = db.invoices.find((i) => i.paymentReference === reference);
    const q = inv ? db.quotes[inv.id] : null;
    if (q) {
      q.expiresAt = new Date(Date.now() + 8_000).toISOString();
      saveDb();
    }
  },
};
