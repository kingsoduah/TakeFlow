"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { CopyButton } from "@/components/ui";
import { daysBetween, formatDate, formatDateTime, networkShort, plural, shortAddress } from "@/lib/format";
import { payUrl } from "@/lib/links";
import { convertDec, formatCrypto, formatMoney, mulDec } from "@/lib/money";
import type { AttentionItem, Dashboard } from "@/lib/types";

const LIMIT = 4;

export function NeedsAttention({ data }: { data: Dashboard }) {
  const items = data.attention.slice(0, LIMIT);
  const total = data.attention.length;
  return (
    <section className="card stack-card rise" aria-labelledby="inbox-title" style={{ animationDelay: ".3s" }}>
      <div className="card-head">
        <h2 id="inbox-title">Needs attention</h2>
        <span className="meta num">{total > LIMIT ? `${LIMIT} of ${total} items` : plural(total, "item")}</span>
      </div>
      {items.length === 0 ? (
        <p className="inbox-empty">Nothing needs you right now. Overdue invoices and payments to review show up here.</p>
      ) : (
        <ul className="inbox">
          {items.map((item) => (
            <Row key={item.id} item={item} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Row({ item, data }: { item: AttentionItem; data: Dashboard }) {
  if (item.kind === "UNMATCHED") {
    // Shown only when the API gave coin prices and rates.
    const coinUsd = data.rates?.coins?.[(item.asset ?? "USDT") as "USDT" | "USDC"];
    const approx = data.rates && coinUsd ? convertDec(mulDec(item.amount, coinUsd), "USD", data.currency, data.rates.perUsd) : null;
    return (
      <li>
        <span className="prio med">
          <Icon name="question" />
          <span className="sr-only">Medium priority</span>
        </span>
        <div className="min-w-0">
          <div className="ib-title num">
            {formatCrypto(item.amount, item.asset ?? "")} <span className="badge b-unmatched">Unmatched</span>
          </div>
          <div className="ib-sub">
            {networkShort(item.network ?? "")}
            {item.senderAddress ? ` from ${shortAddress(item.senderAddress, 4)}` : ""} · {formatDateTime(item.occurredAt)}
          </div>
        </div>
        <div className="ib-amt num">
          {approx ? `≈ ${formatMoney(approx, data.currency)}` : formatCrypto(item.amount, item.asset ?? "")}
          <small>No invoice</small>
        </div>
        <div className="ib-actions">
          <Link className="btn btn-secondary btn-sm" href="/transactions?status=UNMATCHED">
            Review payment
          </Link>
        </div>
      </li>
    );
  }

  const overdue = item.kind === "OVERDUE";
  const late = overdue && item.dueDate ? daysBetween(item.dueDate) : 0;
  return (
    <li>
      <span className={`prio ${overdue ? "high" : "low"}`}>
        <Icon name={overdue ? "alert" : "half"} />
        <span className="sr-only">{overdue ? "High priority" : "Low priority"}</span>
      </span>
      <div className="min-w-0">
        <div className="ib-title">
          {item.invoiceNumber} <span className={`badge ${overdue ? "b-overdue" : "b-partial"}`}>{overdue ? "Overdue" : "Partly paid"}</span>
        </div>
        <div className="ib-sub num">
          {item.clientName ?? "No client"}
          {overdue
            ? ` · ${plural(late, "day")} late`
            : item.amountReceived && item.amountTotal
              ? ` · ${formatMoney(item.amountReceived, item.currency)} of ${formatMoney(item.amountTotal, item.currency)} in`
              : ""}
        </div>
      </div>
      <div className="ib-amt num">
        {formatMoney(item.amount, item.currency)}
        <small>{overdue ? `Due ${formatDate(item.dueDate)}` : "owed"}</small>
      </div>
      <div className="ib-actions">
        {item.paymentReference ? (
          <CopyButton
            variant="small"
            text={payUrl(item.paymentReference)}
            label={`Copy payment link for ${item.invoiceNumber}`}
            done="Link copied"
            toastMessage={`Payment link for ${item.invoiceNumber} copied`}
          />
        ) : null}
        <Link className="btn btn-ghost btn-sm" href={`/invoices/${item.invoiceId}`}>
          View
        </Link>
      </div>
    </li>
  );
}
