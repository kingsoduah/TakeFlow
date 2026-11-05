// Builds the dashboard view from invoices, checkouts, payments and links.
// Totals the API gives in the display currency win over anything worked out
// here. Anything else in another currency is converted with exact decimal
// maths, and only with rates that came from the API. With no rate, the
// value is null and the screen says "Rate unavailable".

import { addDec, cmpDec, convertDec, decToString, parseDec, roundDec, subDec } from "./money";
import {
  INVOICE_STATUSES,
  type AttentionItem,
  type Currency,
  type Dashboard,
  type DashboardSeriesPoint,
  type Invoice,
  type InvoiceStatus,
  type ProductLink,
  type RatesSnapshot,
  type Transaction,
} from "./types";

const DAY = 86_400_000;
type Maybe = string | null;

export interface DashboardHistory {
  // Older daily points to put before the computed ones (oldest first).
  olderSeries?: DashboardSeriesPoint[];
  previous?: Dashboard["previous"];
  outstandingSeries?: string[];
}

export interface ComposeInput {
  currency: Currency;
  now: Date;
  invoices: Invoice[]; // invoices and checkouts
  transactions: Transaction[];
  productLinks: ProductLink[];
  rates: RatesSnapshot | null;
  ratesAsOf?: string | null;
  periodDays: number | null; // null = all time
  history?: DashboardHistory;
  serverTotals?: { invoiced: Maybe; received: Maybe; outstanding: Maybe } | null;
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sumMaybe(values: Maybe[]): Maybe {
  let total = "0";
  for (const v of values) {
    if (v === null) return null;
    total = addDec(total, v);
  }
  return total;
}

const r2 = (v: Maybe): Maybe => (v === null ? null : roundDec(v));

export function composeDashboard(input: ComposeInput): Dashboard {
  const { currency, now, invoices, transactions, productLinks, rates, history, periodDays } = input;
  const conv = (amount: string | null | undefined, from: string | null | undefined): Maybe => {
    if (!amount || !from) return "0";
    if (from === currency) return amount;
    if (!rates) return null;
    return convertDec(amount, from, currency, rates.perUsd);
  };

  const today = startOfDay(now);
  const from = periodDays ? new Date(today.getTime() - (periodDays - 1) * DAY) : null;
  const live = invoices.filter((i) => i.status !== "DRAFT" && i.status !== "EXPIRED");
  const inPeriod = from ? live.filter((i) => new Date(i.issueDate).getTime() >= from.getTime()) : live;
  const periodIds = new Set(inPeriod.map((i) => i.id));

  const byStatus = (s: InvoiceStatus) => inPeriod.filter((i) => i.status === s);
  const owed = (list: Invoice[]) => sumMaybe(list.map((i) => conv(i.amountOutstanding, i.currency)));

  const matched = transactions.filter((t) => t.reconciliationStatus === "MATCHED");
  const periodPayments = matched.filter((t) => t.invoiceId && periodIds.has(t.invoiceId));

  const partly = byStatus("PARTIALLY_PAID");
  const waiting = byStatus("PENDING");
  const overdue = byStatus("OVERDUE");
  const server = input.serverTotals ?? null;
  const invoiced = server ? server.invoiced : sumMaybe(inPeriod.map((i) => conv(i.amount, i.currency)));
  const received = server ? server.received : sumMaybe(periodPayments.map((t) => conv(t.valueAmount, t.valueCurrency)));
  const outstanding = server ? server.outstanding : sumMaybe([owed(partly), owed(waiting), owed(overdue)]);

  const counts = Object.fromEntries(INVOICE_STATUSES.map((s) => [s, 0])) as Record<InvoiceStatus, number>;
  for (const i of inPeriod) counts[i.status] += 1;

  // Average days from issue to the last payment, for paid invoices (not
  // shop orders, which are paid within minutes).
  const paidInvoices = inPeriod.filter((i) => i.status === "PAID" && (i.kind ?? "INVOICE") === "INVOICE");
  let daysTotal = 0;
  let daysCount = 0;
  for (const inv of paidInvoices) {
    const last = matched
      .filter((t) => t.invoiceId === inv.id && (t.occurredAt || t.depositedAt))
      .map((t) => new Date((t.depositedAt ?? t.occurredAt) as string).getTime())
      .sort((a, b) => b - a)[0];
    if (last) {
      daysTotal += (last - new Date(inv.issueDate).getTime()) / DAY;
      daysCount += 1;
    }
  }

  const when = (t: Transaction) => t.depositedAt ?? t.occurredAt ?? t.createdAt;

  // Daily series for the chart: 90 days, oldest first.
  const days = 90;
  const keys: string[] = [];
  for (let k = days - 1; k >= 0; k--) keys.push(dayKey(new Date(today.getTime() - k * DAY)));
  const recMap = new Map<string, Maybe>(keys.map((k) => [k, "0"]));
  const invMap = new Map<string, Maybe>(keys.map((k) => [k, "0"]));
  const bump = (map: Map<string, Maybe>, k: string, v: Maybe) => {
    if (!map.has(k)) return;
    const cur = map.get(k) as Maybe;
    map.set(k, cur === null || v === null ? null : addDec(cur, v));
  };
  for (const i of live) bump(invMap, dayKey(new Date(i.issueDate)), conv(i.amount, i.currency));
  for (const t of matched) bump(recMap, dayKey(new Date(when(t))), conv(t.valueAmount, t.valueCurrency));
  let series: DashboardSeriesPoint[] | null = keys.some((k) => recMap.get(k) === null || invMap.get(k) === null)
    ? null
    : keys.map((k) => ({ date: k, received: roundDec(recMap.get(k) as string), invoiced: roundDec(invMap.get(k) as string) }));
  if (series && history?.olderSeries?.length) {
    const older = history.olderSeries.slice(-(days - 30));
    series = [...older, ...series.slice(-30)].slice(-days);
  }

  // Still owed at the end of each of the last 30 days.
  let outstandingSeries = history?.outstandingSeries;
  if (!outstandingSeries && series) {
    outstandingSeries = [];
    for (let k = 29; k >= 0; k--) {
      const end = today.getTime() - k * DAY + DAY;
      const inv = sumMaybe(live.filter((i) => new Date(i.issueDate).getTime() < end).map((i) => conv(i.amount, i.currency)));
      const rec = sumMaybe(matched.filter((t) => new Date(when(t)).getTime() < end).map((t) => conv(t.valueAmount, t.valueCurrency)));
      if (inv === null || rec === null) break;
      const v = subDec(inv, rec);
      outstandingSeries.push(parseDec(v) < BigInt(0) ? "0" : roundDec(v));
    }
  }

  // Previous 30 days, when there is data for it.
  let previous = history?.previous ?? null;
  const periodStart = from ?? new Date(today.getTime() - 29 * DAY);
  if (!previous) {
    const prevFrom = periodStart.getTime() - 30 * DAY;
    const prevInvoices = live.filter((i) => {
      const t = new Date(i.issueDate).getTime();
      return t >= prevFrom && t < periodStart.getTime();
    });
    const prevInvoiced = sumMaybe(prevInvoices.map((i) => conv(i.amount, i.currency)));
    if (prevInvoices.length > 0 && prevInvoiced !== null) {
      const prevIds = new Set(prevInvoices.map((i) => i.id));
      previous = {
        invoiced: roundDec(prevInvoiced),
        received: roundDec(sumMaybe(matched.filter((t) => t.invoiceId && prevIds.has(t.invoiceId)).map((t) => conv(t.valueAmount, t.valueCurrency))) ?? "0"),
        outstanding: outstandingSeries?.[0] ?? "0",
        paymentsMatched: matched.filter((t) => {
          const at = new Date(when(t)).getTime();
          return at >= prevFrom && at < periodStart.getTime();
        }).length,
        overdueCount: prevInvoices.filter((i) => i.status === "OVERDUE").length,
      };
    }
  }

  const unmatchedTx = transactions.filter((t) => t.reconciliationStatus === "UNMATCHED");
  const unmatchedAssets = Array.from(new Set(unmatchedTx.map((t) => t.asset)));
  const latestUnmatched = [...unmatchedTx].sort((a, b) => when(b).localeCompare(when(a)))[0];

  // Needs attention: overdue first (most late first), then unmatched, then
  // partly paid (latest payment first).
  const attention: AttentionItem[] = [];
  for (const i of live.filter((x) => x.status === "OVERDUE").sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    attention.push({
      kind: "OVERDUE",
      id: `o-${i.id}`,
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      clientName: i.client?.name ?? i.buyerName ?? undefined,
      paymentReference: i.paymentReference,
      amount: i.amountOutstanding,
      currency: i.currency,
      dueDate: i.dueDate,
    });
  }
  for (const t of [...unmatchedTx].sort((a, b) => when(b).localeCompare(when(a)))) {
    attention.push({
      kind: "UNMATCHED",
      id: `u-${t.id}`,
      transactionId: t.id,
      amount: t.amount,
      currency: t.asset,
      asset: t.asset,
      network: t.network,
      senderAddress: t.senderAddress,
      occurredAt: when(t),
    });
  }
  const lastPay = (id: string) =>
    matched
      .filter((t) => t.invoiceId === id)
      .map(when)
      .sort()
      .pop() ?? "";
  for (const i of live.filter((x) => x.status === "PARTIALLY_PAID").sort((a, b) => lastPay(b.id).localeCompare(lastPay(a.id)))) {
    attention.push({
      kind: "PARTIALLY_PAID",
      id: `p-${i.id}`,
      invoiceId: i.id,
      invoiceNumber: i.invoiceNumber,
      clientName: i.client?.name ?? i.buyerName ?? undefined,
      paymentReference: i.paymentReference,
      amount: i.amountOutstanding,
      currency: i.currency,
      amountReceived: i.amountReceived,
      amountTotal: i.amount,
      dueDate: i.dueDate,
    });
  }

  const links = [...productLinks].sort((a, b) => Number(b.active) - Number(a.active) || b.salesCount - a.salesCount);
  const recentPayments = [...transactions].sort((a, b) => when(b).localeCompare(when(a))).slice(0, 10);

  return {
    currency,
    periodLabel: periodDays ? `last ${periodDays} days` : "all time",
    from: from ? from.toISOString() : null,
    to: today.toISOString(),
    totals: {
      invoiced: r2(invoiced),
      received: r2(received),
      outstanding: r2(outstanding),
      paid: { amount: r2(received), invoiceCount: counts.PAID },
      partlyPaidOwed: { amount: r2(owed(partly)), invoiceCount: partly.length },
      waitingOwed: { amount: r2(owed(waiting)), invoiceCount: waiting.length },
      overdueOwed: { amount: r2(owed(overdue)), invoiceCount: overdue.length },
    },
    previous,
    counts: {
      invoices: inPeriod.length,
      currencies: new Set(inPeriod.map((i) => i.currency)).size,
      paymentsMatched: matched.filter((t) => new Date(when(t)).getTime() >= periodStart.getTime()).length,
      open: partly.length + waiting.length + overdue.length,
      overdue: overdue.length,
      byStatus: counts,
      activeLinks: productLinks.filter((l) => l.active).length,
    },
    unmatched: {
      count: unmatchedTx.length,
      amount: decToString(unmatchedTx.reduce((a, t) => a + parseDec(t.amount), BigInt(0))),
      asset: unmatchedAssets.length === 1 ? unmatchedAssets[0] : "in stablecoins",
      latestTransactionId: latestUnmatched?.id ?? null,
    },
    avgDaysToPay: daysCount ? Math.round((daysTotal / daysCount) * 10) / 10 : null,
    statusNotes: {
      partlyNextDue: earliest(partly.map((i) => i.dueDate)),
      waitingNextDue: earliest(waiting.map((i) => i.dueDate)),
      overdueOldestDue: earliest(overdue.map((i) => i.dueDate)),
    },
    series,
    outstandingSeries,
    rates,
    ratesAsOf: input.ratesAsOf ?? rates?.fetchedAt ?? null,
    lastPaymentAt: matched.map(when).sort().pop() || null,
    attention,
    productLinks: links,
    recentPayments,
  };
}

function earliest(dates: string[]): string | null {
  return dates.length ? [...dates].sort()[0] : null;
}

// Percentage change, one decimal place, from exact decimals: "+16.9".
export function changePercent(current: string | null, previous: string | null): string | null {
  if (current === null || previous === null || cmpDec(previous, "0") === 0) return null;
  const diff = parseDec(subDec(current, previous));
  const prev = parseDec(previous);
  const thousand = BigInt(1000);
  let tenths = (diff * thousand) / prev;
  const rem = (diff * thousand) % prev;
  const abs = (x: bigint) => (x < BigInt(0) ? -x : x);
  if (rem !== BigInt(0) && abs(rem) * BigInt(2) >= abs(prev)) tenths += diff < BigInt(0) ? BigInt(-1) : BigInt(1);
  const neg = tenths < BigInt(0);
  const a = abs(tenths);
  return (neg ? "−" : "+") + `${a / BigInt(10)}.${a % BigInt(10)}`;
}

export function countChangePercent(current: number, previous: number): string | null {
  if (!previous) return null;
  const v = Math.round(((current - previous) / previous) * 1000) / 10;
  return (v < 0 ? "−" : "+") + Math.abs(v).toFixed(1);
}
