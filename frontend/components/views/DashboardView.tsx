"use client";

import { useMemo, useState } from "react";
import { CheckoutLinksCard } from "@/components/dashboard/CheckoutLinksCard";
import { InvoiceStatusCard } from "@/components/dashboard/InvoiceStatusCard";
import { Kpis } from "@/components/dashboard/Kpis";
import { MoneyBarHero } from "@/components/dashboard/MoneyBarHero";
import { MoneyChart } from "@/components/dashboard/MoneyChart";
import { NeedsAttention } from "@/components/dashboard/NeedsAttention";
import { PaymentsTable } from "@/components/PaymentsTable";
import { ErrorState, Skeleton } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { formatDateTime, rangeLabel } from "@/lib/format";
import { useAsync, useInterval } from "@/lib/hooks";
import type { Dashboard } from "@/lib/types";

export function DashboardView() {
  const { business, currency } = useApp();
  const { data, error, firstLoad, reload } = useAsync(() => api.getDashboard(business.id, currency), [business.id, currency]);
  // New payments show up without a reload.
  useInterval(reload, 20_000);

  if (error && !data) return <ErrorState message={errorMessage(error)} onRetry={reload} />;
  if (firstLoad || !data) return <DashboardSkeleton />;

  return (
    <>
      <div className="page-head rise">
        <div>
          <h1>Dashboard</h1>
          <p className="range">{data.from ? `Last 30 days · ${rangeLabel(data.from, data.to)}` : "All invoices and orders so far"}</p>
        </div>
        <div className="listen" role="status">
          <span className="pulse" aria-hidden="true" />
          <div>
            <div className="listen-t">Listening for payments</div>
            <div className="listen-s">TRC20 · BEP20 · Base{data.lastPaymentAt ? ` · last one ${formatDateTime(data.lastPaymentAt).replace(/^Today/, "today").replace(/^Yesterday/, "yesterday")}` : ""}</div>
          </div>
        </div>
      </div>

      <MoneyBarHero data={data} />
      <Kpis data={data} />

      <div className="row">
        {data.series ? (
          <MoneyChart series={data.series} currency={data.currency} />
        ) : (
          <section className="card chart-card" aria-labelledby="chart-title">
            <div className="card-head">
              <h2 id="chart-title">Money received</h2>
            </div>
            <p className="px-6 pb-6 pt-3 text-[13px] text-slate-grey">Rate unavailable. The chart converts every payment into {data.currency}, so it shows once rates for all your currencies are in.</p>
          </section>
        )}
        <NeedsAttention data={data} />
      </div>

      <div className="duo">
        <InvoiceStatusCard data={data} />
        <CheckoutLinksCard links={data.productLinks} />
      </div>

      <RecentPayments data={data} />
    </>
  );
}

function RecentPayments({ data }: { data: Dashboard }) {
  const [filter, setFilter] = useState<"all" | "MATCHED" | "UNMATCHED">("all");
  const rows = useMemo(() => data.recentPayments.filter((t) => filter === "all" || t.reconciliationStatus === filter), [data.recentPayments, filter]);
  const counts = {
    all: data.recentPayments.length,
    MATCHED: data.recentPayments.filter((t) => t.reconciliationStatus === "MATCHED").length,
    UNMATCHED: data.recentPayments.filter((t) => t.reconciliationStatus === "UNMATCHED").length,
  };
  return (
    <section className="card rise" aria-labelledby="pay-title" style={{ animationDelay: ".35s" }}>
      <div className="card-head">
        <h2 id="pay-title">Recent payments</h2>
        <div className="filters stretch" role="group" aria-label="Filter payments">
          {(
            [
              ["all", "All"],
              ["MATCHED", "Matched"],
              ["UNMATCHED", "Unmatched"],
            ] as const
          ).map(([key, name]) => (
            <button key={key} type="button" className="fchip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {name} <span className="c num">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>
      <PaymentsTable rows={rows} />
    </section>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading the dashboard">
      <div className="page-head">
        <div className="flex flex-col gap-2">
          <Skeleton h={30} w={180} />
          <Skeleton h={14} w={240} />
        </div>
      </div>
      <Skeleton h={280} className="rounded-[20px]" />
      <div className="kpis">
        <Skeleton h={168} />
        <Skeleton h={168} />
        <Skeleton h={168} />
      </div>
      <div className="row">
        <Skeleton h={420} />
        <Skeleton h={420} />
      </div>
    </div>
  );
}
