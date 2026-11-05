"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { formatTime, plural } from "@/lib/format";
import { formatDecimal, formatMoney, mulDec, percentOf, toNumber } from "@/lib/money";
import type { Currency, Dashboard, RatesSnapshot } from "@/lib/types";

// The hero: one stacked bar sized to total invoiced, split into paid,
// partly paid, waiting and overdue. Amounts always appear as text too.

export const RATE_UNAVAILABLE = "Rate unavailable";

interface Segment {
  key: string;
  name: string;
  amount: string | null;
  count: number;
  detail: string;
  color: string;
  href: string;
}

export function MoneyBarHero({ data }: { data: Dashboard }) {
  const { totals, currency, unmatched } = data;
  const [active, setActive] = useState<string | null>(null);
  const m = (v: string | null) => (v === null ? RATE_UNAVAILABLE : formatMoney(v, currency));

  const segments: Segment[] = [
    {
      key: "paid",
      name: "Paid",
      amount: totals.paid.amount,
      count: totals.paid.invoiceCount,
      detail:
        totals.partlyPaidOwed.invoiceCount > 0
          ? `${plural(totals.paid.invoiceCount, "invoice")} paid in full, plus part payments on ${totals.partlyPaidOwed.invoiceCount}`
          : `${plural(totals.paid.invoiceCount, "invoice")} paid in full`,
      color: "var(--teal-ink)",
      href: "/invoices?status=PAID",
    },
    {
      key: "partly",
      name: "Partly paid",
      amount: totals.partlyPaidOwed.amount,
      count: totals.partlyPaidOwed.invoiceCount,
      detail: `still owed on ${plural(totals.partlyPaidOwed.invoiceCount, "invoice")}`,
      color: "var(--d-partial)",
      href: "/invoices?status=PARTIALLY_PAID",
    },
    {
      key: "waiting",
      name: "Waiting",
      amount: totals.waitingOwed.amount,
      count: totals.waitingOwed.invoiceCount,
      detail: `${plural(totals.waitingOwed.invoiceCount, "invoice")} not yet due`,
      color: "var(--d-owed)",
      href: "/invoices?status=PENDING",
    },
    {
      key: "overdue",
      name: "Overdue",
      amount: totals.overdueOwed.amount,
      count: totals.overdueOwed.invoiceCount,
      detail: `${plural(totals.overdueOwed.invoiceCount, "invoice")} past the due date`,
      color: "var(--d-overdue)",
      href: "/invoices?status=OVERDUE",
    },
  ];

  const total = totals.invoiced === null ? 0 : toNumber(totals.invoiced);
  const allKnown = segments.every((s) => s.amount !== null);
  const shown = allKnown ? segments.filter((s) => toNumber(s.amount) > 0) : [];
  let cursor = 0;
  const geometry = shown.map((s) => {
    const w = total > 0 ? (toNumber(s.amount) / total) * 100 : 0;
    const center = cursor + w / 2;
    cursor += w;
    return { ...s, width: w, center };
  });
  const tip = geometry.find((g) => g.key === active);
  const pct = totals.paid.amount !== null && totals.invoiced !== null ? percentOf(totals.paid.amount, totals.invoiced) : null;

  return (
    <section className="card hero rise" aria-labelledby="hero-title">
      <div className="hero-top">
        <div className="hero-statement">
          <h2 className="eyebrow" id="hero-title">
            From invoiced to paid · {data.periodLabel}
          </h2>
          <div className="hero-big">
            <span className="num">{m(totals.paid.amount)}</span>
            <span className="word">paid</span>
          </div>
          <p className="hero-of num">
            of <b>{m(totals.invoiced)}</b> invoiced{pct !== null ? ` · ${pct}%` : ""}
          </p>
        </div>
        <RateChips rates={data.rates} ratesAsOf={data.ratesAsOf} />
      </div>

      <div className="mbar-wrap">
        {total > 0 && geometry.length > 0 ? (
          <>
            <div className="mbar" role="group" aria-label={`Invoiced ${m(totals.invoiced)}, split by status`}>
              {geometry.map((g) => (
                <Link
                  key={g.key}
                  href={g.href}
                  className="mbar-seg"
                  data-active={active === g.key}
                  style={{ flexGrow: g.width, flexBasis: 0, ["--c" as string]: g.color }}
                  aria-label={`${g.name}: ${m(g.amount)}, ${g.detail}`}
                  onMouseEnter={() => setActive(g.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(g.key)}
                  onBlur={() => setActive(null)}
                />
              ))}
            </div>
            {tip ? (
              <div className="mbar-tip num" style={{ left: `clamp(110px, ${tip.center}%, calc(100% - 110px))` }} aria-hidden="true">
                <b>
                  {tip.name} · {m(tip.amount)}
                </b>
                {tip.detail}
              </div>
            ) : null}
          </>
        ) : (
          <div className="mbar-empty" aria-hidden="true" />
        )}
      </div>

      <ul className="mbar-legend num" aria-label="Amounts by status">
        {segments.map((s) => (
          <li key={s.key} style={{ ["--c" as string]: s.color }}>
            <span className="sw" aria-hidden="true" />
            <div className="min-w-0">
              <span className="n">{s.name}</span>
              <span className="v">{m(s.amount)}</span>
              <span className="c">{plural(s.count, "invoice")}</span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hero-foot">
        <p className="hero-owed num">
          <b>{m(totals.outstanding)}</b> still owed · {plural(data.counts.open, "invoice")}
        </p>
        {unmatched.count > 0 ? (
          <Link className="review-chip num" href="/transactions?status=UNMATCHED">
            <Icon name="question" />
            {plural(unmatched.count, "payment")} to review · {formatDecimal(unmatched.amount, unmatched.amount.includes(".") ? 2 : 0)} {unmatched.asset}
            <Icon name="arrowRight" className="icon go" />
          </Link>
        ) : data.counts.invoices === 0 ? (
          <Link className="btn btn-secondary btn-sm" href="/invoices/new">
            <Icon name="plus" className="icon icon-sm" />
            Create your first invoice
          </Link>
        ) : null}
      </div>
    </section>
  );
}

// "1 USDT = ₦1,375 · £0.75 · €0.92 · GH₵12.30" at Roqqu rates. The chips need
// coin prices; without them only the rate time shows.
export function RateChips({ rates, ratesAsOf }: { rates: RatesSnapshot | null; ratesAsOf: string | null }) {
  const order: Currency[] = ["NGN", "GBP", "EUR", "GHS"];
  const usdt = rates?.coins?.USDT;
  const canChip = !!usdt && order.every((c) => rates?.perUsd[c]);
  const asOf = ratesAsOf ?? rates?.fetchedAt ?? null;
  if (!asOf && !canChip) return null;
  return (
    <div className="rates">
      <span className="rates-line">
        <Icon name="refresh" />
        Converted at Roqqu rates{asOf ? ` · rate from ${formatTime(asOf)}` : ""}
      </span>
      {canChip && rates && usdt ? (
        <div className="chips num">
          <span className="chip lead">1 USDT</span>
          {order.map((c) => (
            <span key={c} className="chip">
              {formatMoney(mulDec(usdt, rates.perUsd[c]), c, c === "NGN" ? 0 : 2)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
