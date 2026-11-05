"use client";

import Link from "next/link";
import { Icon } from "@/components/icons";
import { CoinNet, TxBadge } from "@/components/ui";
import { explorerFor, formatDateTime, initials, shortAddress, shortHash, tintFor } from "@/lib/format";
import { formatCrypto, formatMoney } from "@/lib/money";
import type { Transaction } from "@/lib/types";

export function PaymentsTable({ rows, emptyText = "No payments in this view.", tall = false, showReceiving = false }: { rows: Transaction[]; emptyText?: string; tall?: boolean; showReceiving?: boolean }) {
  return (
    <div className={`table-scroll${tall ? " tall" : ""}`}>
      <table className="dt">
        <thead>
          <tr>
            <th scope="col">Client or order</th>
            <th scope="col">Invoice</th>
            <th scope="col">Coin · network</th>
            <th scope="col" className="r">
              Amount
            </th>
            <th scope="col">Status</th>
            {showReceiving ? <th scope="col">Sent to</th> : null}
            <th scope="col">Transaction</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={showReceiving ? 7 : 6}>{emptyText}</td>
            </tr>
          ) : (
            rows.map((t) => <PaymentRow key={t.id} t={t} showReceiving={showReceiving} />)
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaymentRow({ t, showReceiving }: { t: Transaction; showReceiving: boolean }) {
  const inv = t.invoice;
  const when = formatDateTime(t.occurredAt ?? t.createdAt);
  const isOrder = inv?.kind === "CHECKOUT";
  const explorer = explorerFor(t.network);
  let who: React.ReactNode;
  if (!inv) {
    who = (
      <div className="who">
        <span className="av unknown" aria-hidden="true">
          ?
        </span>
        <div className="min-w-0">
          <b>Unknown sender</b>
          <span className="sub">
            {t.senderAddress ? shortAddress(t.senderAddress, 4) + " · " : ""}
            {when}
          </span>
        </div>
      </div>
    );
  } else if (isOrder) {
    who = (
      <div className="who">
        <span className="av order" aria-hidden="true">
          <Icon name="bag" className="icon icon-sm" />
        </span>
        <div className="min-w-0">
          <Link href={`/invoices/${inv.id}`}>
            <b>{inv.externalOrderId ? `Order #${inv.externalOrderId}` : "Shop order"}</b>
          </Link>
          <span className="sub">
            {inv.productTitle ? inv.productTitle + " · " : ""}
            {when}
          </span>
        </div>
      </div>
    );
  } else {
    const name = inv.clientName ?? "No client";
    who = (
      <div className="who">
        <span className={`av ${tintFor(name)}`} aria-hidden="true">
          {initials(name)}
        </span>
        <div className="min-w-0">
          <Link href={`/invoices/${inv.id}`}>
            <b>{name}</b>
          </Link>
          <span className="sub">
            {inv.status === "PARTIALLY_PAID" ? "Part payment · " : ""}
            {when}
          </span>
        </div>
      </div>
    );
  }
  return (
    <tr>
      <td className="c-who m-a">{who}</td>
      <td className="num m-e">
        {inv ? (
          <Link href={`/invoices/${inv.id}`} className="tlink">
            {inv.invoiceNumber}
          </Link>
        ) : (
          <span className="dash">No invoice</span>
        )}
      </td>
      <td className="m-c">
        <CoinNet asset={t.asset} network={t.network} />
      </td>
      <td className="r num m-b">
        <span className="amt-main">{t.valueAmount && t.valueCurrency ? formatMoney(t.valueAmount, t.valueCurrency) : <span className="dash">Not matched</span>}</span>
        <span className="sub">{formatCrypto(t.amount, t.asset)}</span>
      </td>
      <td className="m-d">
        <TxBadge status={t.reconciliationStatus} />
      </td>
      {showReceiving ? (
        <td className="m-hide">
          <span className="mono" style={{ fontSize: 12 }} title={t.receivingAddress}>
            {shortAddress(t.receivingAddress, 6)}
          </span>
        </td>
      ) : null}
      <td className="m-f">
        {explorer ? (
          <a className="hash" href={explorer.tx(t.transactionHash)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${shortHash(t.transactionHash)} on ${explorer.name} (opens in a new tab)`}>
            {shortHash(t.transactionHash)}
            <Icon name="ext" />
          </a>
        ) : (
          <span className="hash">{shortHash(t.transactionHash)}</span>
        )}
      </td>
    </tr>
  );
}
