"use client";

import { useId } from "react";
import { smoothPath, cumulative } from "@/components/charts";
import { Icon } from "@/components/icons";
import { changePercent, countChangePercent } from "@/lib/dashboard";
import { daysBetween, plural } from "@/lib/format";
import { formatMoney, toNumber } from "@/lib/money";
import type { Dashboard } from "@/lib/types";

// The hero owns the invoiced, paid and owed amounts, so these cards lead
// with the 30-day trend or a count instead of repeating them.

export function Kpis({ data }: { data: Dashboard }) {
  const { previous, counts, currency } = data;
  const m = (v: string) => formatMoney(v, currency);
  const last30 = data.series ? data.series.slice(-30) : [];

  const invoicedChange = previous ? changePercent(data.totals.invoiced, previous.invoiced) : null;
  const owedChange = previous ? changePercent(data.totals.outstanding, previous.outstanding) : null;
  const matchedChange = previous ? countChangePercent(counts.paymentsMatched, previous.paymentsMatched) : null;
  const oldestLate = data.statusNotes.overdueOldestDue ? daysBetween(data.statusNotes.overdueOldestDue) : null;

  const invSpark = cumulative(last30.map((p) => toNumber(p.invoiced)));
  const recSpark = cumulative(last30.map((p) => toNumber(p.received)));
  const owedSpark = (data.outstandingSeries ?? []).map((v) => toNumber(v));

  return (
    <section className="kpis" aria-label="Trends against the previous 30 days">
      <article className="card kpi rise" style={{ ["--c" as string]: "var(--navy)", animationDelay: ".1s" }}>
        <div className="kpi-top">
          <span className="kpi-label">
            <i />
            Invoiced, 30-day change
          </span>
          <span className="delta neutral num">{plural(counts.invoices, "invoice")}</span>
        </div>
        <div className="kpi-value num">
          {invoicedChange ? (
            <>
              <Arrow up={!invoicedChange.startsWith("−")} />
              {invoicedChange}%
            </>
          ) : (
            <small>No earlier month to compare</small>
          )}
        </div>
        <p className="kpi-note num">
          {previous ? (
            <>
              {invoicedChange?.startsWith("−") ? "Down" : "Up"} from <b>{m(previous.invoiced)}</b> in the previous 30 days
            </>
          ) : (
            <>{plural(counts.invoices, "invoice")} so far</>
          )}
          {counts.currencies > 1 ? ` · ${counts.currencies} currencies` : ""}
        </p>
        <Spark data={invSpark} color="var(--navy)" />
      </article>

      <article className="card kpi rise" style={{ ["--c" as string]: "var(--teal)", animationDelay: ".15s" }}>
        <div className="kpi-top">
          <span className="kpi-label">
            <i />
            Payments matched
          </span>
          {matchedChange ? (
            <span className={`delta ${matchedChange.startsWith("−") ? "neutral" : "good"} num`}>
              <Icon name={matchedChange.startsWith("−") ? "down" : "up"} />
              {matchedChange}%
            </span>
          ) : null}
        </div>
        <div className="kpi-value num">
          {counts.paymentsMatched}
          <small>{counts.paymentsMatched === 1 ? "payment" : "payments"}</small>
        </div>
        <p className="kpi-note num">
          {data.avgDaysToPay != null ? (
            <>
              Invoices paid <b>{data.avgDaysToPay} days</b> after issue on average
            </>
          ) : (
            <>Matched to invoices as they arrive</>
          )}
          {data.unmatched.count > 0 ? ` · ${data.unmatched.count} to review` : ""}
        </p>
        <Spark data={recSpark} color="var(--teal-ink)" />
      </article>

      <article className="card kpi rise" style={{ ["--c" as string]: "var(--d-owed)", animationDelay: ".2s" }}>
        <div className="kpi-top">
          <span className="kpi-label">
            <i />
            Still owed, 30-day change
          </span>
          {counts.overdue > 0 ? <span className="delta bad num">{counts.overdue} overdue</span> : <span className="delta good">None overdue</span>}
        </div>
        <div className="kpi-value num">
          {owedChange ? (
            <>
              <Arrow up={!owedChange.startsWith("−")} />
              {owedChange}%
            </>
          ) : (
            <small>No earlier month to compare</small>
          )}
        </div>
        <p className="kpi-note num">
          {previous ? (
            <>
              {owedChange?.startsWith("−") ? "Down" : "Up"} from <b>{m(previous.outstanding)}</b> owed 30 days ago
            </>
          ) : (
            <>{plural(counts.open, "open invoice")}</>
          )}
          {oldestLate && oldestLate > 0 ? ` · oldest ${plural(oldestLate, "day")} late` : ""}
        </p>
        <Spark data={owedSpark} color="var(--slate)" />
      </article>
    </section>
  );
}

function Arrow({ up }: { up: boolean }) {
  return <Icon name={up ? "up" : "down"} className="icon" style={{ width: "0.7em", height: "0.7em", strokeWidth: 2.4, alignSelf: "center" }} />;
}

function Spark({ data, color }: { data: number[]; color: string }) {
  const id = useId().replace(/:/g, "");
  if (data.length < 2) return <svg className="spark" viewBox="0 0 100 40" aria-hidden="true" />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * 100, 36 - ((v - min) / (max - min || 1)) * 30] as [number, number]);
  const line = smoothPath(pts);
  return (
    <svg className="spark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`sf${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".18" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L100,40L0,40Z`} fill={`url(#sf${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
