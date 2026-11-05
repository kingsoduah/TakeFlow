"use client";

import { useMemo, useState, type KeyboardEvent, type MouseEvent } from "react";
import { smoothPath } from "@/components/charts";
import { useSize } from "@/lib/hooks";
import { addDec, compactMoney, formatMoney, toNumber } from "@/lib/money";
import type { Currency, DashboardSeriesPoint } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (key: string) => {
  const [y, mo, d] = key.split("-").map(Number);
  return { short: `${d} ${MONTHS[mo - 1]}`, long: `${d} ${MONTHS[mo - 1]} ${y}` };
};

export function MoneyChart({ series, currency }: { series: DashboardSeriesPoint[]; currency: Currency }) {
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [hover, setHover] = useState<number | null>(null);
  const [wrapRef, size] = useSize<HTMLDivElement>();
  const m = (v: string) => formatMoney(v, currency);

  const view = useMemo(() => {
    const pts = series.slice(-period);
    const cumRec: string[] = [];
    const cumInv: string[] = [];
    pts.forEach((p, i) => {
      cumRec.push(addDec(i ? cumRec[i - 1] : "0", p.received));
      cumInv.push(addDec(i ? cumInv[i - 1] : "0", p.invoiced));
    });
    return { pts, cumRec, cumInv };
  }, [series, period]);

  const n = view.pts.length;
  const W = size.width;
  const H = size.height;
  const padL = 52;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const cr = view.cumRec.map(toNumber);
  const ci = view.cumInv.map(toNumber);
  const top = Math.max(cr[n - 1] ?? 0, ci[n - 1] ?? 0, 1);
  const p10 = Math.pow(10, Math.floor(Math.log10(top)));
  const max = (Math.ceil((top / p10) * 2) / 2) * p10;
  const X = (i: number) => padL + (i * (W - padL - padR)) / Math.max(1, n - 1);
  const Y = (v: number) => padT + (1 - v / max) * (H - padT - padB);

  const ready = W > 0 && H > 0 && n > 1;
  const recPts = cr.map((v, i) => [X(i), Y(v)] as [number, number]);
  const invPts = ci.map((v, i) => [X(i), Y(v)] as [number, number]);
  const recLine = ready ? smoothPath(recPts) : "";
  const invLine = ready ? smoothPath(invPts) : "";
  const step = period === 7 ? 1 : period === 30 ? 7 : 15;
  const ticks: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) ticks.push(i);

  const totRec = view.cumRec[n - 1] ?? "0";
  const totInv = view.cumInv[n - 1] ?? "0";

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!ready) return;
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round((e.clientX - r.left - X(0)) / (X(1) - X(0)));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = hover ?? n - 1;
    const keys: Record<string, number> = { ArrowLeft: Math.max(0, i - 1), ArrowRight: Math.min(n - 1, i + 1), Home: 0, End: n - 1 };
    if (e.key in keys) {
      e.preventDefault();
      setHover(keys[e.key]);
    }
  };

  const hv = hover != null && hover < n ? hover : null;
  const tipLeft = hv != null ? (X(hv) + 14 + 210 > W - 4 ? X(hv) - 210 - 14 : X(hv) + 14) : 0;

  return (
    <section className="card chart-card rise" aria-labelledby="chart-title" style={{ animationDelay: ".25s" }}>
      <div className="card-head">
        <h2 id="chart-title">Money received</h2>
        <div className="seg" role="radiogroup" aria-label="Chart period">
          {([7, 30, 90] as const).map((p) => (
            <label key={p}>
              <input
                type="radio"
                name="chart-period"
                value={p}
                checked={period === p}
                onChange={() => {
                  setPeriod(p);
                  setHover(null);
                }}
              />
              <span>{p}D</span>
            </label>
          ))}
        </div>
      </div>
      <p className="chart-sum num" style={{ fontSize: 13, color: "var(--ink-2)" }}>
        Received <b style={{ color: "var(--navy)", fontWeight: 600 }}>{m(totRec)}</b>&nbsp;of {m(totInv)} invoiced in {period} days
      </p>
      <div className="legend" aria-hidden="true">
        <span>
          <i className="sw-line" />
          Received, running total
        </span>
        <span>
          <i className="sw-dash" />
          Invoiced, running total
        </span>
      </div>
      <div
        ref={wrapRef}
        className="chart"
        tabIndex={0}
        role="img"
        aria-label={`Running total of money received over ${period} days: ${m(totRec)} received against ${m(totInv)} invoiced. Use the left and right arrow keys to read each day.`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(n - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={onKey}
      >
        {ready ? (
          <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
            <defs>
              <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--teal)" stopOpacity=".34" />
                <stop offset=".65" stopColor="var(--mint)" stopOpacity=".5" />
                <stop offset="1" stopColor="var(--mint)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3, 4].map((g) => {
              const gy = Y((max * g) / 4);
              return (
                <g key={g}>
                  <line x1={padL} x2={W - padR} y1={gy} y2={gy} stroke={g === 0 ? "var(--border-strong)" : "var(--border)"} />
                  <text x={padL - 10} y={gy + 4} textAnchor="end">
                    {compactMoney((max * g) / 4, currency)}
                  </text>
                </g>
              );
            })}
            {ticks.map((i) => (
              <text key={i} x={X(i)} y={H - 8} textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}>
                {label(view.pts[i].date).short}
              </text>
            ))}
            <path d={`${recLine}L${X(n - 1)},${Y(0)}L${X(0)},${Y(0)}Z`} fill="url(#area-fill)" />
            <path d={invLine} fill="none" stroke="var(--navy)" strokeWidth="1.5" strokeDasharray="5 5" opacity=".75" />
            <path key={`${period}-${currency}`} className="chart-line" d={recLine} fill="none" stroke="var(--teal-ink)" strokeWidth="2.5" strokeLinecap="round" />
            {hv != null ? (
              <g>
                <line x1={X(hv)} x2={X(hv)} y1={padT} y2={Y(0)} stroke="var(--navy)" strokeOpacity=".25" />
                <circle cx={X(hv)} cy={Y(ci[hv])} r="4" fill="#fff" stroke="var(--navy)" strokeWidth="2" />
                <circle cx={X(hv)} cy={Y(cr[hv])} r="5" fill="#fff" stroke="var(--teal-ink)" strokeWidth="2.5" />
              </g>
            ) : null}
          </svg>
        ) : null}
        {hv != null && ready ? (
          <div className="tip num" style={{ left: Math.max(4, tipLeft) }} aria-hidden="true">
            <div className="d">{label(view.pts[hv].date).long}</div>
            <div className="r">
              <span>Received that day</span>
              <b>{m(view.pts[hv].received)}</b>
            </div>
            <div className="r">
              <span>
                <i style={{ background: "var(--teal)" }} />
                Received to date
              </span>
              <b>{m(view.cumRec[hv])}</b>
            </div>
            <div className="r">
              <span>
                <i style={{ background: "var(--on-navy)" }} />
                Invoiced to date
              </span>
              <b>{m(view.cumInv[hv])}</b>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
