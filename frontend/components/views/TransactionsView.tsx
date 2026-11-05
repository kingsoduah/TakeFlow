"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/icons";
import { PaymentsTable } from "@/components/PaymentsTable";
import { Empty, ErrorState, LoadingCard } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { networkShort } from "@/lib/format";
import { useAsync, useInterval } from "@/lib/hooks";
import type { Transaction } from "@/lib/types";

type Filter = "all" | "MATCHED" | "UNMATCHED";

function csvCell(v: string | number | null | undefined): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(rows: Transaction[], businessName: string) {
  const header = ["Date", "Status", "Client or order", "Invoice", "Coin", "Network", "Amount", "Value", "Value currency", "Rate used", "Valued at", "Transaction hash", "Sent to", "Sent from"];
  const lines = rows.map((t) => {
    const who = t.invoice ? (t.invoice.kind === "CHECKOUT" ? (t.invoice.externalOrderId ? `Order #${t.invoice.externalOrderId}` : "Shop order") : t.invoice.clientName ?? "") : "Unknown sender";
    return [
      t.depositedAt ?? t.occurredAt ?? t.createdAt,
      t.reconciliationStatus === "MATCHED" ? "Matched" : t.reconciliationStatus === "UNMATCHED" ? "Unmatched" : "Checking",
      who,
      t.invoice?.invoiceNumber ?? "",
      t.asset,
      networkShort(t.network),
      t.amount,
      t.valueAmount ?? "",
      t.valueCurrency ?? "",
      t.valuationRate ?? "",
      t.valuationMethod === "QUOTE" ? "Quoted price" : t.valuationMethod === "ARRIVAL" ? "Rate on arrival" : "",
      t.transactionHash,
      t.receivingAddress,
      t.senderAddress ?? "",
    ]
      .map(csvCell)
      .join(",");
  });
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${businessName.replace(/[^\w-]+/g, "-").toLowerCase()}-transactions.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function TransactionsView() {
  const { business } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const initial = params.get("status");
  const [filter, setFilter] = useState<Filter>(initial === "MATCHED" || initial === "UNMATCHED" ? initial : "all");
  const { data, error, firstLoad, reload } = useAsync(() => api.listTransactions(business.id, { limit: 200 }), [business.id]);
  useInterval(reload, 15_000);

  const all = useMemo(() => data?.data ?? [], [data]);
  const rows = useMemo(() => all.filter((t) => filter === "all" || t.reconciliationStatus === filter), [all, filter]);
  const counts = {
    all: all.length,
    MATCHED: all.filter((t) => t.reconciliationStatus === "MATCHED").length,
    UNMATCHED: all.filter((t) => t.reconciliationStatus === "UNMATCHED").length,
  };

  const choose = (f: Filter) => {
    setFilter(f);
    router.replace(f === "all" ? "/transactions" : `/transactions?status=${f}`, { scroll: false });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p className="range">Every payment that reached your addresses, checked on-chain and matched to its invoice.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => downloadCsv(rows, business.businessName)} disabled={rows.length === 0}>
          <Icon name="file" className="icon icon-sm" />
          Download CSV
        </button>
      </div>

      {filter === "UNMATCHED" && counts.UNMATCHED > 0 ? (
        <p className="note warn">
          <Icon name="question" className="icon icon-sm" />
          <span>
            <b>These payments arrived without an open invoice to match.</b> Check the sender on the explorer, then contact them to find out what they paid for.
          </span>
        </p>
      ) : null}

      <section className="card" aria-label="Transactions">
        <div className="card-head">
          <div className="filters stretch" role="group" aria-label="Filter transactions">
            {(
              [
                ["all", "All"],
                ["MATCHED", "Matched"],
                ["UNMATCHED", "Unmatched"],
              ] as const
            ).map(([key, name]) => (
              <button key={key} type="button" className="fchip" aria-pressed={filter === key} onClick={() => choose(key)}>
                {name} <span className="c num">{counts[key]}</span>
              </button>
            ))}
          </div>
          <span className="meta">Explorer links open Tronscan, BscScan or Basescan</span>
        </div>
        {error && !data ? (
          <ErrorState message={errorMessage(error)} onRetry={reload} />
        ) : firstLoad ? (
          <div className="p-6">
            <LoadingCard rows={5} />
          </div>
        ) : all.length === 0 ? (
          <Empty icon="swap" title="No payments yet">
            Payments show up here as soon as they arrive on TRC20, BEP20 or Base.
          </Empty>
        ) : (
          <PaymentsTable rows={rows} tall showReceiving emptyText="No payments in this view." />
        )}
      </section>
    </>
  );
}
