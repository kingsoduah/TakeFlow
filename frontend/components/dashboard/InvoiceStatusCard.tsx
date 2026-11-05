"use client";

import Link from "next/link";
import { daysBetween, formatDate, networkShort, plural } from "@/lib/format";
import { formatCrypto } from "@/lib/money";
import type { Dashboard } from "@/lib/types";

export function InvoiceStatusCard({ data }: { data: Dashboard }) {
  const c = data.counts.byStatus;
  const notes = data.statusNotes;
  const total = c.PAID + c.PARTIALLY_PAID + c.PENDING + c.OVERDUE;
  const oldest = notes.overdueOldestDue ? daysBetween(notes.overdueOldestDue) : 0;
  const cells = [
    { key: "PAID", badge: "b-paid", name: "Paid", n: c.PAID, note: c.PAID ? "paid in full" : "none yet" },
    { key: "PARTIALLY_PAID", badge: "b-partial", name: "Partly paid", n: c.PARTIALLY_PAID, note: notes.partlyNextDue ? `next due ${formatDate(notes.partlyNextDue)}` : "none" },
    { key: "PENDING", badge: "b-waiting", name: "Waiting", n: c.PENDING, note: notes.waitingNextDue ? `next due ${formatDate(notes.waitingNextDue)}` : "none" },
    { key: "OVERDUE", badge: "b-overdue", name: "Overdue", n: c.OVERDUE, note: oldest > 0 ? `oldest ${plural(oldest, "day")} late` : "none" },
  ];
  const latest = data.attention.find((a) => a.kind === "UNMATCHED");
  return (
    <section className="card stack-card rise" aria-labelledby="status-title" style={{ animationDelay: ".4s" }}>
      <div className="card-head">
        <h2 id="status-title">Invoice status</h2>
        <span className="meta num">{plural(total, "invoice")}</span>
      </div>
      <div className="status-body">
        <div className="stackbar" aria-hidden="true">
          {total > 0 ? (
            <>
              <i style={{ flex: c.PAID, background: "var(--teal-ink)" }} />
              <i style={{ flex: c.PARTIALLY_PAID, background: "var(--d-partial)" }} />
              <i style={{ flex: c.PENDING, background: "var(--d-owed)" }} />
              <i style={{ flex: c.OVERDUE, background: "var(--d-overdue)" }} />
            </>
          ) : (
            <i style={{ flex: 1, background: "var(--surface-sunk)" }} />
          )}
        </div>
        <div className="st-grid">
          {cells.map((cell) => (
            <Link key={cell.key} href={`/invoices?status=${cell.key}`} className="st-cell" aria-label={`${cell.name}: ${plural(cell.n, "invoice")}, ${cell.note}`}>
              <span className="top">
                <span className={`badge ${cell.badge}`}>{cell.name}</span>
                <b className="num">{cell.n}</b>
              </span>
              <span className="owed num">{cell.note}</span>
            </Link>
          ))}
        </div>
        {data.unmatched.count > 0 ? (
          <div className="unm">
            <p className="num">
              {plural(data.unmatched.count, "unmatched payment")} to review
              {latest ? <span>{formatCrypto(latest.amount, latest.asset ?? "")} · {networkShort(latest.network ?? "")}, {formatDate(latest.occurredAt)}</span> : null}
            </p>
            <Link className="btn btn-secondary btn-sm" href="/transactions?status=UNMATCHED">
              Review
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
