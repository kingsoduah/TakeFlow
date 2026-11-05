// Sample data for NEXT_PUBLIC_USE_MOCKS=true. It mirrors the approved
// dashboard design and is kept consistent with the 5 Nov 2026 Roqqu rates:
// 1 USD = 0.75 GBP = 0.92 EUR = 1,375 NGN = 12.3 GHS, and 1 USDT = 1.00 USD.
// Dates are relative to today so the demo always reads "today".
//
// In US dollars the last 30 days come to: invoiced 52,480.00, paid 39,719.21,
// partly paid still owed 2,860.00, waiting 5,200.79, overdue 4,700.00, plus
// one unmatched payment of 640 USDT.

import { addDec, ceilDec, cmpDec, divDec, isZero, mulDec, parseDec, subDec } from "./money";
import type {
  ApiKey,
  Business,
  Client,
  CryptoAsset,
  Currency,
  Invoice,
  InvoiceStatus,
  Network,
  ProductLink,
  PublicQuote,
  Transaction,
  User,
} from "./types";

export const MOCK_PER_USD: Record<Currency, string> = { NGN: "1375", USD: "1", GBP: "0.75", EUR: "0.92", GHS: "12.3" };
export const MOCK_COIN_USD: Record<CryptoAsset, string> = { USDT: "1", USDC: "1" };

export type MockProductLink = Omit<ProductLink, "salesCount" | "totalReceived">;

export interface MockDb {
  version: number;
  seededAt: string;
  users: (User & { password: string })[];
  businesses: Business[];
  clients: Client[];
  invoices: Invoice[];
  transactions: Transaction[];
  productLinks: MockProductLink[];
  apiKeys: (ApiKey & { businessId: string })[];
  quotes: Record<string, PublicQuote>;
  invoiceCounter: Record<string, number>;
}

export const MOCK_DB_VERSION = 4;
const STORAGE_KEY = "takeflow.mockdb";

// ---------- deterministic random ----------

function mulberry(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Seeding uses a fixed sequence so the sample data is the same on every
// machine; anything created later uses Math.random so ids never repeat.
let rand = mulberry(20261105);
let seeding = false;
const HEX = "0123456789abcdef";
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function pick(alphabet: string, n: number) {
  const r = seeding ? rand : Math.random;
  let s = "";
  for (let i = 0; i < n; i++) s += alphabet[Math.floor(r() * alphabet.length)];
  return s;
}

export function mockUuid() {
  return `${pick(HEX, 8)}-${pick(HEX, 4)}-4${pick(HEX, 3)}-a${pick(HEX, 3)}-${pick(HEX, 12)}`;
}
export function mockAddress(network: Network) {
  return network === "trc20" ? "T" + pick(B58, 33) : "0x" + pick(HEX, 40);
}
export function mockTxHash(network: Network | string) {
  return network === "trc20" ? pick(HEX, 64) : "0x" + pick(HEX, 64);
}
export function mockPayRef() {
  return "pay_" + pick(HEX, 32);
}
export function mockLinkRef() {
  return "link_" + pick(HEX, 32);
}
export function mockApiKeySecret() {
  const prefix = "tfk_" + pick(HEX, 12);
  return { prefix, key: `${prefix}_${pick(HEX, 48)}` };
}

// ---------- rates ----------

// Price currency per 1 coin.
export function coinRate(asset: CryptoAsset, currency: Currency): string {
  return mulDec(MOCK_COIN_USD[asset], MOCK_PER_USD[currency]);
}

export function convertMock(amount: string, from: Currency, to: Currency): string {
  if (from === to) return amount;
  return mulDec(divDec(amount, MOCK_PER_USD[from]), MOCK_PER_USD[to]);
}

// The feed "updated" a couple of minutes ago, on the minute.
export function mockRatesFetchedAt(now = new Date()): string {
  const d = new Date(now.getTime() - 2 * 60_000);
  d.setSeconds(0, 0);
  return d.toISOString();
}

// ---------- seed ----------

type PairId = "USDT-trc20" | "USDT-bep20" | "USDC-base";
const PAIRS: Record<PairId, { asset: CryptoAsset; network: Network }> = {
  "USDT-trc20": { asset: "USDT", network: "trc20" },
  "USDT-bep20": { asset: "USDT", network: "bep20" },
  "USDC-base": { asset: "USDC", network: "base" },
};

interface SeedPay {
  d: number; // days ago
  t: string; // HH:MM
  crypto: string;
}

interface SeedInv {
  client?: string;
  order?: string;
  buyer?: string;
  product?: "kit" | "icons";
  ccy: Currency;
  amount: string;
  pair: PairId;
  issued: [number, string];
  dueIn: number; // days after issue
  desc: string;
  pays: SeedPay[];
  expiredDaysAgo?: number;
}

const CLIENTS: [string, string][] = [
  ["Lagoon Logistics", "finance@lagoonlogistics.example"],
  ["Meridian Health Tech", "ap@meridianhealth.example"],
  ["Volta Fintech", "accounts@voltafintech.example"],
  ["Copperline Studios", "billing@copperline.example"],
  ["Halden Works", "hello@haldenworks.example"],
  ["Adebayo & Co.", "accounts@adebayoandco.example"],
  ["Savanna Health", "billing@savannahealth.example"],
  ["Maple & Pine Co.", "ap@mapleandpine.example"],
  ["Northgate Labs", "accounts@northgatelabs.example"],
  ["Brightwater Media", "finance@brightwatermedia.example"],
  ["Ofori Digital", "pay@oforidigital.example"],
  ["Kente Commerce", "finance@kentecommerce.example"],
  ["Adire Fashion House", "orders@adirefashion.example"],
  ["Harbour & Vine", "accounts@harbourandvine.example"],
  ["Northwind Analytics", "ap@northwindanalytics.example"],
  ["Lakeside Ventures", "finance@lakesideventures.example"],
  ["Zuri Creative", "hello@zuricreative.example"],
  ["Bolt Ridge Ltd", "accounts@boltridge.example"],
];

const B2B: SeedInv[] = [
  // Paid in full
  { client: "Lagoon Logistics", ccy: "NGN", amount: "6875000", pair: "USDT-bep20", issued: [29, "09:10"], dueIn: 14, desc: "Driver app, milestone 2", pays: [{ d: 25, t: "13:40", crypto: "2500" }, { d: 16, t: "10:25", crypto: "2500" }] },
  { client: "Meridian Health Tech", ccy: "GBP", amount: "4500", pair: "USDT-trc20", issued: [27, "11:00"], dueIn: 21, desc: "Patient portal, design and build", pays: [{ d: 22, t: "15:05", crypto: "3000" }, { d: 8, t: "09:48", crypto: "3000" }] },
  { client: "Volta Fintech", ccy: "GHS", amount: "61500", pair: "USDC-base", issued: [24, "10:15"], dueIn: 14, desc: "Wallet onboarding flow", pays: [{ d: 19, t: "16:20", crypto: "5000" }] },
  { client: "Copperline Studios", ccy: "USD", amount: "4199.21", pair: "USDT-trc20", issued: [21, "14:30"], dueIn: 14, desc: "Retainer, October, with expenses", pays: [{ d: 17, t: "11:12", crypto: "2000" }, { d: 11, t: "17:35", crypto: "2199.21" }] },
  { client: "Halden Works", ccy: "GBP", amount: "918.75", pair: "USDT-bep20", issued: [12, "09:00"], dueIn: 14, desc: "Booking widget fixes", pays: [{ d: 4, t: "09:32", crypto: "1225" }] },
  { client: "Adebayo & Co.", ccy: "NGN", amount: "2200000", pair: "USDT-bep20", issued: [9, "12:20"], dueIn: 14, desc: "Company website refresh", pays: [{ d: 3, t: "10:05", crypto: "1600" }] },
  { client: "Savanna Health", ccy: "EUR", amount: "2990", pair: "USDT-trc20", issued: [8, "10:40"], dueIn: 21, desc: "Clinic dashboard, phase 1", pays: [{ d: 3, t: "16:48", crypto: "3250" }] },
  { client: "Maple & Pine Co.", ccy: "USD", amount: "4500", pair: "USDC-base", issued: [6, "15:10"], dueIn: 14, desc: "Online store build", pays: [{ d: 1, t: "14:02", crypto: "4500" }] },
  { client: "Northgate Labs", ccy: "GBP", amount: "1050", pair: "USDT-trc20", issued: [3, "09:30"], dueIn: 14, desc: "API integration sprint", pays: [{ d: 0, t: "10:42", crypto: "1400" }] },
  // Overdue
  { client: "Brightwater Media", ccy: "GBP", amount: "2400", pair: "USDT-trc20", issued: [26, "10:00"], dueIn: 14, desc: "Video platform prototype", pays: [] },
  { client: "Ofori Digital", ccy: "GHS", amount: "18450", pair: "USDT-bep20", issued: [18, "13:15"], dueIn: 14, desc: "Merchant app, first release", pays: [] },
  // Partly paid
  { client: "Kente Commerce", ccy: "GHS", amount: "24600", pair: "USDC-base", issued: [10, "11:45"], dueIn: 14, desc: "Marketplace checkout", pays: [{ d: 0, t: "09:15", crypto: "1200" }] },
  { client: "Adire Fashion House", ccy: "NGN", amount: "2750000", pair: "USDT-bep20", issued: [13, "16:00"], dueIn: 14, desc: "Lookbook site and shop", pays: [{ d: 7, t: "12:30", crypto: "1000" }] },
  { client: "Harbour & Vine", ccy: "USD", amount: "3500", pair: "USDC-base", issued: [7, "10:20"], dueIn: 14, desc: "Wine club subscriptions", pays: [{ d: 2, t: "18:05", crypto: "2440" }] },
  // Waiting
  { client: "Northwind Analytics", ccy: "EUR", amount: "1104", pair: "USDC-base", issued: [2, "14:00"], dueIn: 14, desc: "Data pipeline audit", pays: [] },
  { client: "Lakeside Ventures", ccy: "USD", amount: "1450.79", pair: "USDT-trc20", issued: [5, "09:50"], dueIn: 14, desc: "Hosting and support, October", pays: [] },
  { client: "Zuri Creative", ccy: "NGN", amount: "1375000", pair: "USDT-bep20", issued: [4, "11:30"], dueIn: 14, desc: "Brand site, deposit", pays: [] },
  { client: "Bolt Ridge Ltd", ccy: "GBP", amount: "1162.5", pair: "USDT-trc20", issued: [0, "08:30"], dueIn: 14, desc: "Fleet tracking dashboard", pays: [] },
];

const KIT_DAYS: [number, string, string][] = [
  [27, "19:20", "A-2251"],
  [20, "12:05", "A-2262"],
  [14, "20:40", "A-2270"],
  [9, "08:55", "A-2275"],
  [6, "16:12", "A-2279"],
  [1, "18:30", "A-2291"],
];
const ICON_DAYS: [number, string, string][] = [
  [29, "21:10", "A-2248"],
  [26, "07:45", "A-2253"],
  [24, "22:30", "A-2256"],
  [21, "13:05", "A-2260"],
  [19, "18:50", "A-2264"],
  [17, "09:20", "A-2266"],
  [15, "23:15", "A-2268"],
  [13, "14:40", "A-2272"],
  [11, "20:05", "A-2274"],
  [8, "10:30", "A-2277"],
  [6, "19:45", "A-2281"],
  [4, "21:17", "A-2284"],
  [2, "11:55", "A-2289"],
];
const BUYERS = ["Amaka N.", "Kofi B.", "Lena M.", "Yusuf A.", "Grace O.", "Tunde F.", "Mia K.", "Efua D.", "Jonas P.", "Ngozi E.", "Sam R.", "Ama T.", "Ife L.", "Paul W.", "Zainab H.", "Chidi U.", "Hana S.", "Kwame A.", "Ola J."];

function at(daysAgo: number, hhmm: string, now: Date): string {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo, h, m, 0, 0);
  if (d.getTime() > now.getTime() - 5 * 60_000) {
    // A time later today has not happened yet: keep it today, a little earlier.
    return new Date(now.getTime() - (8 + (h % 9) * 11 + (m % 7)) * 60_000).toISOString();
  }
  return d.toISOString();
}

function addDays(iso: string, days: number) {
  return new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();
}

export function statusFor(inv: Pick<Invoice, "amount" | "amountReceived" | "dueDate" | "expiresAt" | "kind">, now = new Date()): InvoiceStatus {
  const tolerance = mulDec(inv.amount, "0.005");
  if (cmpDec(addDec(inv.amountReceived, tolerance), inv.amount) >= 0) return "PAID";
  if (!isZero(inv.amountReceived)) return "PARTIALLY_PAID";
  if (inv.expiresAt && new Date(inv.expiresAt).getTime() < now.getTime()) return "EXPIRED";
  if (new Date(inv.dueDate).getTime() < now.getTime()) return "OVERDUE";
  return "PENDING";
}

export function seed(now = new Date()): MockDb {
  rand = mulberry(20261105);
  seeding = true;
  try {
    return buildSeed(now);
  } finally {
    seeding = false;
  }
}

function buildSeed(now: Date): MockDb {
  const created = at(40, "09:00", now);
  const userId = mockUuid();
  const businessId = mockUuid();
  const user = {
    id: userId,
    fullName: "Tolu Adeyemi",
    email: "tolu@lumenstudio.example",
    displayCurrency: "USD" as Currency,
    password: "",
    createdAt: created,
    updatedAt: created,
  };
  const business: Business = {
    id: businessId,
    ownerId: userId,
    businessName: "Lumen Studio",
    businessEmail: "billing@lumenstudio.example",
    businessType: "Software studio · Lagos and London",
    quoteWindowMinutes: 5,
    shortfallToleranceBps: 50,
    createdAt: created,
    updatedAt: created,
  };
  const clients: Client[] = CLIENTS.map(([name, email]) => ({
    id: mockUuid(),
    businessId,
    name,
    email,
    createdAt: created,
    updatedAt: created,
  }));
  const clientByName = new Map(clients.map((c) => [c.name, c]));

  const kit: MockProductLink = {
    id: mockUuid(),
    businessId,
    reference: mockLinkRef(),
    title: "Website starter kit",
    description: "Five-page website template with a setup call",
    amount: "343750",
    currency: "NGN",
    cryptoAsset: "USDT",
    network: "bep20",
    returnUrl: "https://shop.lumenstudio.example/thank-you",
    active: true,
    createdAt: at(35, "10:00", now),
    updatedAt: at(35, "10:00", now),
  };
  const icons: MockProductLink = {
    id: mockUuid(),
    businessId,
    reference: mockLinkRef(),
    title: "Icon set licence",
    description: "240 line icons with a commercial licence",
    amount: "78.2",
    currency: "EUR",
    cryptoAsset: "USDC",
    network: "base",
    returnUrl: "https://shop.lumenstudio.example/thank-you",
    active: true,
    createdAt: at(34, "10:00", now),
    updatedAt: at(34, "10:00", now),
  };
  const workshop: MockProductLink = {
    id: mockUuid(),
    businessId,
    reference: mockLinkRef(),
    title: "Brand workshop seat",
    description: "Half-day remote workshop, one seat",
    amount: "120",
    currency: "USD",
    cryptoAsset: "USDT",
    network: "trc20",
    returnUrl: null,
    active: false,
    createdAt: at(60, "10:00", now),
    updatedAt: at(31, "10:00", now),
  };

  // All receivables, then sorted by issue time to get invoice numbers.
  const seeds: SeedInv[] = [...B2B];
  KIT_DAYS.forEach(([d, t, order], i) =>
    seeds.push({ order, buyer: BUYERS[i], product: "kit", ccy: "NGN", amount: "343750", pair: "USDT-bep20", issued: [d, t], dueIn: 1, desc: "Website starter kit", pays: [{ d, t: bump(t, 3), crypto: "250" }] }),
  );
  ICON_DAYS.forEach(([d, t, order], i) =>
    seeds.push({ order, buyer: BUYERS[6 + i], product: "icons", ccy: "EUR", amount: "78.2", pair: "USDC-base", issued: [d, t], dueIn: 1, desc: "Icon set licence", pays: [{ d, t: bump(t, 2), crypto: "85" }] }),
  );
  seeds.push({ order: "A-2283", buyer: "Chiamaka Obi", ccy: "NGN", amount: "412500", pair: "USDT-trc20", issued: [5, "13:20"], dueIn: 1, desc: "Brand refresh deposit", pays: [{ d: 5, t: "13:31", crypto: "300" }] });
  seeds.push({ order: "A-2288", buyer: "Daniel Mensah", ccy: "USD", amount: "450", pair: "USDC-base", issued: [3, "17:05"], dueIn: 1, desc: "Event landing page", pays: [], expiredDaysAgo: 2 });

  const withTimes = seeds
    .map((s) => ({ s, issuedAt: at(s.issued[0], s.issued[1], now) }))
    .sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));

  const invoices: Invoice[] = [];
  const transactions: Transaction[] = [];
  let number = 1008;

  for (const { s, issuedAt } of withTimes) {
    const { asset, network } = PAIRS[s.pair];
    const link = s.product === "kit" ? kit : s.product === "icons" ? icons : null;
    const client = s.client ? clientByName.get(s.client) ?? null : null;
    const isCheckout = !!s.order;
    const dueDate = isCheckout ? addDays(issuedAt, 1) : endOfDay(addDays(issuedAt, s.dueIn));
    const expiresAt = isCheckout ? (s.expiredDaysAgo ? at(s.expiredDaysAgo, s.issued[1], now) : addDays(issuedAt, 1)) : null;
    const inv: Invoice = {
      id: mockUuid(),
      businessId,
      kind: isCheckout ? "CHECKOUT" : "INVOICE",
      clientId: client?.id ?? null,
      invoiceNumber: `INV-${number++}`,
      paymentReference: mockPayRef(),
      description: s.desc,
      amount: s.amount,
      currency: s.ccy,
      cryptoAsset: asset,
      network,
      issueDate: issuedAt,
      dueDate,
      paymentAddress: mockAddress(network),
      status: "PENDING",
      amountReceived: "0",
      amountOutstanding: s.amount,
      amountOverpaid: "0",
      createdAt: issuedAt,
      updatedAt: issuedAt,
      client: client ? { id: client.id, name: client.name, email: client.email } : null,
      externalOrderId: s.order ?? null,
      buyerName: s.buyer ?? null,
      buyerEmail: null,
      returnUrl: link?.returnUrl ?? null,
      expiresAt,
      productLinkId: link?.id ?? null,
      productTitle: link?.title ?? null,
    };
    const rate = coinRate(asset, s.ccy);
    for (const p of s.pays) {
      const occurredAt = at(p.d, p.t, now);
      // A quote's crypto amount is rounded up, so its value can pass the
      // price by a fraction of a minor unit. Store what reduces the balance.
      const raw = mulDec(p.crypto, rate);
      const value = cmpDec(raw, inv.amountOutstanding) > 0 ? inv.amountOutstanding : raw;
      inv.amountReceived = addDec(inv.amountReceived, value);
      inv.amountOutstanding = maxZero(subDec(inv.amount, inv.amountReceived));
      inv.updatedAt = occurredAt;
      transactions.push(makeTx(inv, client?.name ?? null, { crypto: p.crypto, value, rate, occurredAt, network, asset }));
    }
    inv.status = statusFor(inv, now);
    invoices.push(inv);
  }
  // Statuses on payment refs depend on the final invoice status.
  for (const t of transactions) {
    const inv = invoices.find((i) => i.id === t.invoiceId);
    if (inv && t.invoice) t.invoice.status = inv.status;
  }

  // One payment nobody could match.
  const unmatchedAt = at(1, "11:20", now);
  transactions.push({
    id: mockUuid(),
    businessId,
    invoiceId: null,
    transactionHash: mockTxHash("trc20"),
    receivingAddress: mockAddress("trc20"),
    senderAddress: "TXk4" + pick(B58, 26) + "8mQe",
    asset: "USDT",
    network: "trc20",
    amount: "640",
    excessAmount: "0",
    reconciliationStatus: "UNMATCHED",
    occurredAt: unmatchedAt,
    createdAt: unmatchedAt,
    updatedAt: unmatchedAt,
    invoice: null,
    valueCurrency: null,
    valueAmount: null,
    valuationRate: null,
    valuationMethod: null,
    valuedAt: null,
  });
  transactions.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));

  const shopKey = mockApiKeySecret();
  const oldKey = mockApiKeySecret();
  const apiKeys = [
    { id: mockUuid(), businessId, name: "Shop website", prefix: shopKey.prefix, lastUsedAt: at(1, "18:29", now), revokedAt: null, createdAt: at(12, "10:15", now) },
    { id: mockUuid(), businessId, name: "Old test key", prefix: oldKey.prefix, lastUsedAt: at(20, "09:02", now), revokedAt: at(12, "10:16", now), createdAt: at(33, "15:40", now) },
  ];

  return {
    version: MOCK_DB_VERSION,
    seededAt: now.toISOString(),
    users: [user],
    businesses: [business],
    clients,
    invoices,
    transactions,
    productLinks: [kit, icons, workshop],
    apiKeys,
    quotes: {},
    invoiceCounter: { [businessId]: number },
  };
}

function bump(hhmm: string, minutes: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(23 * 60 + 59, h * 60 + m + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function endOfDay(iso: string) {
  const d = new Date(iso);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

export function maxZero(v: string) {
  return parseDec(v) < BigInt(0) ? "0" : v;
}

export function makeTx(
  inv: Invoice,
  clientName: string | null,
  p: { crypto: string; value: string; rate: string; occurredAt: string; network: Network; asset: CryptoAsset; quoteBased?: boolean },
): Transaction {
  return {
    id: mockUuid(),
    businessId: inv.businessId,
    invoiceId: inv.id,
    transactionHash: mockTxHash(p.network),
    receivingAddress: inv.paymentAddress ?? mockAddress(p.network),
    senderAddress: mockAddress(p.network),
    asset: p.asset,
    network: p.network,
    amount: p.crypto,
    excessAmount: "0",
    reconciliationStatus: "MATCHED",
    occurredAt: p.occurredAt,
    createdAt: p.occurredAt,
    updatedAt: p.occurredAt,
    invoice: {
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      kind: inv.kind,
      clientName,
      externalOrderId: inv.externalOrderId ?? null,
      productTitle: inv.productTitle ?? inv.description ?? null,
    },
    valueCurrency: inv.currency,
    valueAmount: p.value,
    valuationRate: p.rate,
    valuationMethod: p.quoteBased === false ? "ARRIVAL" : "QUOTE",
    valuedAt: p.occurredAt,
  };
}

// Crypto needed for an amount in a price currency, rounded up.
export function cryptoFor(amount: string, asset: CryptoAsset, currency: Currency): string {
  return ceilDec(divDec(amount, coinRate(asset, currency)), 2);
}

// ---------- persistence ----------

let db: MockDb | null = null;

export function getDb(): MockDb {
  if (db) return db;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        const sameDay = new Date(parsed.seededAt).toDateString() === new Date().toDateString();
        if (parsed.version === MOCK_DB_VERSION && sameDay) {
          db = parsed;
          return db;
        }
      }
    } catch {
      // Unreadable sample data: start fresh.
    }
  }
  db = seed();
  saveDb();
  return db;
}

export function saveDb() {
  if (!db || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: the sample data still works for this tab.
  }
}

export function resetDb() {
  db = seed();
  saveDb();
}
