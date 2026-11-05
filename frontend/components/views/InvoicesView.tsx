"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { CoinNet, CopyButton, Empty, ErrorState, LoadingCard, StatusBadge } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { daysBetween, formatDate, initials, plural, STATUS_LABEL, tintFor } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { payUrl } from "@/lib/links";
import { formatMoney, isZero } from "@/lib/money";
import { INVOICE_STATUSES, type Invoice, type InvoiceStatus } from "@/lib/types";

type Kind = "all" | "INVOICE" | "CHECKOUT";
const ORDER: InvoiceStatus[] = ["PENDING", "PARTIALLY_PAID", "OVERDUE", "PAID", "DRAFT", "EXPIRED"];

export function invoiceTitle(i: Invoice): string {
  if (i.kind === "CHECKOUT") return i.externalOrderId ? `Order #${i.externalOrderId}` : i.buyerName ? `Order from ${i.buyerName}` : "Shop order";
  return i.client?.name ?? "No client";
}

export function InvoicesView() {
  const { business } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status");
  const [status, setStatus] = useState<InvoiceStatus | "all">(INVOICE_STATUSES.includes(initial as InvoiceStatus) ? (initial as InvoiceStatus) : "all");
  const [kind, setKind] = useState<Kind>("all");
  const [q, setQ] = useState("");
  const { data, error, firstLoad, reload } = useAsync(() => api.listInvoices(business.id, { limit: 200 }), [business.id]);

  const byKind = useMemo(() => (data?.data ?? []).filter((i) => kind === "all" || (i.kind ?? "INVOICE") === kind), [data, kind]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(INVOICE_STATUSES.map((s) => [s, 0])) as Record<InvoiceStatus, number>;
    byKind.forEach((i) => (c[i.status] += 1));
    return c;
  }, [byKind]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return byKind.filter(
      (i) =>
        (status === "all" || i.status === status) &&
        (!needle || [i.invoiceNumber, invoiceTitle(i), i.description ?? "", i.productTitle ?? "", i.buyerName ?? ""].some((s) => s.toLowerCase().includes(needle))),
    );
  }, [byKind, status, q]);

  const choose = (s: InvoiceStatus | "all") => {
    setStatus(s);
    router.replace(s === "all" ? "/invoices" : `/invoices?status=${s}`, { scroll: false });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Invoices</h1>
          <p className="range">Invoices you send and orders from your checkout links, each in its own currency.</p>
        </div>
      </div>

      <section className="card" aria-label="Invoice list">
        <div className="card-head" style={{ alignItems: "flex-start" }}>
          <div className="filters" role="group" aria-label="Filter by status">
            <button type="button" className="fchip" aria-pressed={status === "all"} onClick={() => choose("all")}>
              All <span className="c num">{byKind.length}</span>
            </button>
            {ORDER.filter((s) => counts[s] > 0 || s === status).map((s) => (
              <button key={s} type="button" className="fchip" aria-pressed={status === s} onClick={() => choose(s)}>
                {STATUS_LABEL[s]} <span className="c num">{counts[s]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="seg" role="radiogroup" aria-label="Type">
              {(
                [
                  ["all", "All types"],
                  ["INVOICE", "Invoices"],
                  ["CHECKOUT", "Shop orders"],
                ] as const
              ).map(([k, name]) => (
                <label key={k}>
                  <input type="radio" name="inv-kind" checked={kind === k} onChange={() => setKind(k)} />
                  <span>{name}</span>
                </label>
              ))}
            </div>
            <label className="relative block w-full sm:w-56">
              <span className="sr-only">Search invoices</span>
              <Icon name="search" className="icon icon-sm pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-grey" />
              <input className="input" style={{ minHeight: 36, paddingLeft: 34 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
          </div>
        </div>

        {error && !data ? (
          <ErrorState message={errorMessage(error)} onRetry={reload} />
        ) : firstLoad ? (
          <div className="p-6">
            <LoadingCard rows={5} />
          </div>
        ) : (data?.total ?? 0) === 0 ? (
          <Empty
            title="No invoices yet"
            action={
              <Link href="/invoices/new" className="btn btn-primary btn-sm">
                <Icon name="plus" className="icon icon-sm" />
                Create your first invoice
              </Link>
            }
          >
            Price it in your client&apos;s currency. They pay in USDT or USDC, and the payment is matched here for you.
          </Empty>
        ) : (
          <div className="table-scroll tall">
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="r">
                    Price
                  </th>
                  <th scope="col" className="r">
                    Still owed
                  </th>
                  <th scope="col">Due</th>
                  <th scope="col">Coin · network</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={7}>No invoices match this view.</td>
                  </tr>
                ) : (
                  rows.map((i) => <InvoiceRow key={i.id} inv={i} />)
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  const title = invoiceTitle(inv);
  const isOrder = inv.kind === "CHECKOUT";
  const late = inv.status === "OVERDUE" ? daysBetween(inv.dueDate) : 0;
  const owedZero = isZero(inv.amountOutstanding);
  return (
    <tr>
      <td className="c-who m-a">
        <div className="who">
          {isOrder ? (
            <span className="av order" aria-hidden="true">
              <Icon name="bag" className="icon icon-sm" />
            </span>
          ) : (
            <span className={`av ${tintFor(title)}`} aria-hidden="true">
              {initials(title)}
            </span>
          )}
          <div className="min-w-0">
            <Link href={`/invoices/${inv.id}`}>
              <b>{title}</b>
            </Link>
            <span className="sub num">
              {inv.invoiceNumber}
              {isOrder && inv.productTitle ? ` · ${inv.productTitle}` : inv.description ? ` · ${inv.description}` : ""}
            </span>
          </div>
        </div>
      </td>
      <td className="m-d">
        <StatusBadge status={inv.status} />
      </td>
      <td className="r num m-hide">{formatMoney(inv.amount, inv.currency)}</td>
      <td className="r num m-b">
        <span className="amt-main">{owedZero ? <span className="dash">Nothing owed</span> : formatMoney(inv.amountOutstanding, inv.currency)}</span>
        <span className="sub">of {formatMoney(inv.amount, inv.currency)}</span>
      </td>
      <td className="num m-e">
        {isOrder && inv.status !== "OVERDUE" ? (
          <span className="dash">{inv.status === "EXPIRED" ? `Expired ${formatDate(inv.expiresAt)}` : formatDate(inv.issueDate)}</span>
        ) : (
          <>
            {formatDate(inv.dueDate)}
            {late > 0 ? <span className="sub">{plural(late, "day")} late</span> : null}
          </>
        )}
      </td>
      <td className="m-c">
        <CoinNet asset={inv.cryptoAsset} network={inv.network} />
      </td>
      <td className="r m-f">
        <div className="inline-flex items-center gap-2">
          {inv.status !== "DRAFT" && inv.status !== "PAID" && inv.status !== "EXPIRED" ? (
            <CopyButton text={payUrl(inv.paymentReference)} label={`Copy payment link for ${inv.invoiceNumber}`} toastMessage={`Payment link for ${inv.invoiceNumber} copied`} />
          ) : null}
          <Link href={`/invoices/${inv.id}`} className="icon-btn" aria-label={`Open ${inv.invoiceNumber}`}>
            <Icon name="chevronRight" className="icon icon-sm" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
