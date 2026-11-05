"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoinNet, CopyButton, ErrorState, LoadingCard, StatusBadge, TxBadge, useToast } from "@/components/ui";
import { api, ApiError, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { daysBetween, explorerFor, formatDate, formatDateTime, networkName, plural, shortHash } from "@/lib/format";
import { useAsync, useInterval } from "@/lib/hooks";
import { payUrl, withoutScheme } from "@/lib/links";
import { formatCrypto, formatMoney, isZero, percentOf, toNumber } from "@/lib/money";
import { invoiceTitle } from "./InvoicesView";

export function InvoiceDetailView() {
  const { business, refreshNav } = useApp();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = params.id;
  const toast = useToast();
  const { data, error, firstLoad, reload } = useAsync(() => api.getInvoicePayments(business.id, id), [business.id, id]);
  const [busy, setBusy] = useState(false);
  const inv = data?.invoice;
  const open = inv && (inv.status === "PENDING" || inv.status === "PARTIALLY_PAID" || inv.status === "OVERDUE");
  // Payments show up here as they are matched.
  useInterval(reload, open ? 10_000 : null);

  if (error && !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="card">
        <ErrorState message={notFound ? "This invoice doesn't exist, or it belongs to another business." : errorMessage(error)} onRetry={notFound ? undefined : reload} />
      </div>
    );
  }
  if (firstLoad || !data || !inv) return <LoadingCard rows={6} />;

  const url = payUrl(inv.paymentReference);
  const m = (v: string) => formatMoney(v, inv.currency);
  const pct = percentOf(inv.amountReceived, inv.amount);
  const late = inv.status === "OVERDUE" ? daysBetween(inv.dueDate) : 0;
  const isOrder = inv.kind === "CHECKOUT";
  const explorer = explorerFor(inv.network);

  const sendDraft = async () => {
    setBusy(true);
    try {
      await api.assignAddress(business.id, inv.id);
      await api.updateInvoice(business.id, inv.id, { status: "PENDING" });
      toast("Payment link is ready");
      refreshNav();
      reload();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div className="min-w-0">
          <Link href="/invoices" className="back">
            <Icon name="arrowLeft" className="icon icon-sm" />
            Invoices
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="num">{inv.invoiceNumber}</h1>
            <StatusBadge status={inv.status} />
          </div>
          <p className="range">
            {invoiceTitle(inv)}
            {isOrder && inv.productTitle ? ` · ${inv.productTitle}` : inv.description ? ` · ${inv.description}` : ""}
          </p>
        </div>
        {inv.status !== "DRAFT" ? (
          <div className="flex flex-wrap gap-2">
            <CopyButton variant="button" text={url} label={`Copy payment link for ${inv.invoiceNumber}`} toastMessage="Payment link copied" />
            <a className="btn btn-primary" href={`/pay/${inv.paymentReference}`} target="_blank" rel="noopener noreferrer">
              Open payment page
              <Icon name="ext" className="icon icon-sm" />
            </a>
          </div>
        ) : null}
      </div>

      {search.get("created") ? (
        <div className="note" role="status">
          <Icon name="check" className="icon icon-sm" />
          <span>
            <b>Invoice created.</b> Copy the payment link and send it to your client by email or WhatsApp. This page updates when they pay.
          </span>
        </div>
      ) : null}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <section className="card card-body pt-6" aria-label="Amounts">
            <div className="stat-row num">
              <div className="stat">
                <div className="k">Price</div>
                <div className="v">{m(inv.amount)}</div>
                <div className="x">{inv.currency} price</div>
              </div>
              <div className="stat">
                <div className="k">Received</div>
                <div className="v">{m(inv.amountReceived)}</div>
                <div className="x">{plural(data.paymentCount, "payment")}</div>
              </div>
              <div className="stat">
                <div className="k">Still owed</div>
                <div className="v">{m(inv.amountOutstanding)}</div>
                <div className="x">{late > 0 ? `${plural(late, "day")} late` : isOrder ? `Ordered ${formatDate(inv.issueDate)}` : `Due ${formatDate(inv.dueDate, { year: true })}`}</div>
              </div>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <div className="progress flex-1" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Number(pct))} aria-label="Share of the price received">
                <i style={{ width: `${Math.min(100, toNumber(pct))}%` }} />
              </div>
              <span className="text-[13px] font-semibold num">{pct}% paid</span>
            </div>
            {inv.amountOverpaid && !isZero(inv.amountOverpaid) ? (
              <p className="note warn mt-4">
                <Icon name="alert" className="icon icon-sm" />
                <span>
                  Overpaid by <b>{m(inv.amountOverpaid)}</b>. Check with your client before refunding anything.
                </span>
              </p>
            ) : null}
          </section>

          <section className="card" aria-labelledby="payments-title">
            <div className="card-head">
              <h2 id="payments-title">Payments</h2>
              <span className="meta">{open ? "Checking for new payments every few seconds" : plural(data.paymentCount, "payment")}</span>
            </div>
            {data.transactions.length === 0 ? (
              <p className="px-6 pb-6 pt-3 text-[13px] text-slate-grey">No payments yet. They appear here once they arrive on-chain and match this invoice.</p>
            ) : (
              <div className="table-scroll tall">
                <table className="dt">
                  <thead>
                    <tr>
                      <th scope="col">Received</th>
                      <th scope="col" className="r">
                        Value
                      </th>
                      <th scope="col">Rate used</th>
                      <th scope="col">Status</th>
                      <th scope="col">Transaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t) => {
                      const ex = explorerFor(t.network);
                      return (
                        <tr key={t.id}>
                          <td className="m-a">
                            <b className="font-semibold num">{formatCrypto(t.amount, t.asset)}</b>
                            <span className="sub">{formatDateTime(t.occurredAt ?? t.createdAt)}</span>
                          </td>
                          <td className="r num m-b">
                            <span className="amt-main">{t.valueAmount && t.valueCurrency ? formatMoney(t.valueAmount, t.valueCurrency) : <span className="dash">Not valued yet</span>}</span>
                          </td>
                          <td className="num m-c m-nopad">
                            {t.valuationRate ? (
                              <>
                                1 {t.asset} = {formatMoney(t.valuationRate, t.valueCurrency ?? inv.currency, (t.valueCurrency ?? inv.currency) === "NGN" ? 0 : 2)}
                                <span className="sub">{t.valuationMethod === "QUOTE" ? "Quoted price, paid in time" : "Rate when it arrived"}</span>
                              </>
                            ) : (
                              <span className="dash">None</span>
                            )}
                          </td>
                          <td className="m-d">
                            <TxBadge status={t.reconciliationStatus} />
                          </td>
                          <td className="m-f">
                            {ex ? (
                              <a className="hash" href={ex.tx(t.transactionHash)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${shortHash(t.transactionHash)} on ${ex.name} (opens in a new tab)`}>
                                {shortHash(t.transactionHash)}
                                <Icon name="ext" />
                              </a>
                            ) : (
                              <span className="hash">{shortHash(t.transactionHash)}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className="card card-body pt-6" aria-labelledby="link-title">
            <h2 id="link-title" className="text-[16px] font-bold">
              Payment link
            </h2>
            {inv.status === "DRAFT" ? (
              <>
                <p className="mt-2 text-[13px] text-ink-2">This invoice is a draft, so it has no payment link yet.</p>
                <button type="button" className="btn btn-primary mt-4" onClick={sendDraft} disabled={busy}>
                  {busy ? "Getting the link…" : "Get payment link"}
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 text-[13px] text-ink-2">Anyone with this link can pay. No account needed.</p>
                <div className="copybox mt-3">
                  <span className="val" title={url}>
                    {withoutScheme(url)}
                  </span>
                  <CopyButton text={url} label="Copy payment link" toastMessage="Payment link copied" />
                </div>
                {inv.paymentAddress ? (
                  <>
                    <p className="label mt-4">Receiving address</p>
                    <div className="copybox wrap mt-1.5">
                      <span className="val">{inv.paymentAddress}</span>
                      <CopyButton text={inv.paymentAddress} label="Copy receiving address" toastMessage="Address copied" />
                    </div>
                    {explorer ? (
                      <a className="link mt-2 inline-flex items-center gap-1 text-[13px]" href={explorer.address(inv.paymentAddress)} target="_blank" rel="noopener noreferrer">
                        View on {explorer.name}
                        <Icon name="ext" className="icon icon-xs" />
                      </a>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </section>

          <section className="card card-body pt-6" aria-labelledby="details-title">
            <h2 id="details-title" className="mb-4 text-[16px] font-bold">
              Details
            </h2>
            <dl className="dl">
              {isOrder ? (
                <>
                  <dt>Buyer</dt>
                  <dd>{inv.buyerName ?? "Not given"}</dd>
                  {inv.buyerEmail ? (
                    <>
                      <dt>Buyer email</dt>
                      <dd>{inv.buyerEmail}</dd>
                    </>
                  ) : null}
                  {inv.externalOrderId ? (
                    <>
                      <dt>Order ID</dt>
                      <dd>{inv.externalOrderId}</dd>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <dt>Client</dt>
                  <dd>{inv.client?.name ?? "No client"}</dd>
                  {inv.client?.email ? (
                    <>
                      <dt>Client email</dt>
                      <dd>{inv.client.email}</dd>
                    </>
                  ) : null}
                </>
              )}
              <dt>Coin</dt>
              <dd>
                <CoinNet asset={inv.cryptoAsset} network={inv.network} />
                <span className="sub">{networkName(inv.network)}</span>
              </dd>
              <dt>Issued</dt>
              <dd>{formatDate(inv.issueDate, { year: true })}</dd>
              {isOrder ? (
                <>
                  <dt>Link expires</dt>
                  <dd>{inv.expiresAt ? `${formatDate(inv.expiresAt, { year: true })}, ${formatDateTime(inv.expiresAt).split(", ").pop()}` : "Never"}</dd>
                </>
              ) : (
                <>
                  <dt>Due</dt>
                  <dd>{formatDate(inv.dueDate, { year: true })}</dd>
                </>
              )}
              {inv.returnUrl ? (
                <>
                  <dt>Back to shop</dt>
                  <dd className="truncate" title={inv.returnUrl}>
                    {withoutScheme(inv.returnUrl)}
                  </dd>
                </>
              ) : null}
              <dt>Reference</dt>
              <dd className="mono text-[12px]">{inv.paymentReference}</dd>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
