"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { CoinNet, CopyButton, Empty, ErrorState, LoadingCard, StatusBadge, useToast } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { formatDate, formatDateTime } from "@/lib/format";
import { useAsync } from "@/lib/hooks";
import { payUrl, productLinkUrl, withoutScheme } from "@/lib/links";
import { formatMoney, isZero } from "@/lib/money";
import type { Invoice, ProductLink } from "@/lib/types";

export function CheckoutLinksView() {
  const { business, refreshNav } = useApp();
  const toast = useToast();
  const links = useAsync(() => api.listProductLinks(business.id), [business.id]);
  const orders = useAsync(() => api.listCheckouts(business.id), [business.id]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = async (l: ProductLink) => {
    setBusyId(l.id);
    try {
      const updated = await api.updateProductLink(business.id, l.id, { active: !l.active });
      links.setData((prev) => (prev ?? []).map((x) => (x.id === l.id ? { ...x, active: updated.active } : x)));
      toast(updated.active ? `${l.title} is taking payments again` : `${l.title} is turned off`);
      refreshNav();
    } catch (err) {
      toast(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Checkout links</h1>
          <p className="range">Share a link on WhatsApp, Instagram, email or your website. Buyers pay in stablecoins.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/checkout-links/new?type=order" className="btn btn-secondary">
            <Icon name="bag" className="icon icon-sm" />
            New one-order link
          </Link>
          <Link href="/checkout-links/new?type=product" className="btn btn-primary">
            <Icon name="plus" className="icon icon-sm" />
            New product link
          </Link>
        </div>
      </div>

      <section className="card" aria-labelledby="pl-title">
        <div className="card-head">
          <div>
            <h2 id="pl-title">Product links</h2>
            <p className="text-[13px] text-slate-grey">One link, many buyers. Each buyer gets their own checkout.</p>
          </div>
        </div>
        {links.error && !links.data ? (
          <ErrorState message={errorMessage(links.error)} onRetry={links.reload} />
        ) : links.firstLoad ? (
          <div className="p-6">
            <LoadingCard rows={2} />
          </div>
        ) : (links.data ?? []).length === 0 ? (
          <Empty
            icon="link"
            title="No product links yet"
            action={
              <Link href="/checkout-links/new?type=product" className="btn btn-secondary btn-sm">
                Create a product link
              </Link>
            }
          >
            Sell the same thing to many buyers with one link, such as a template, a licence or a seat.
          </Empty>
        ) : (
          <ul className="grid gap-3 p-4 sm:p-6 md:grid-cols-2 xl:grid-cols-3">
            {(links.data ?? []).map((l) => (
              <ProductLinkCard key={l.id} link={l} busy={busyId === l.id} onToggle={() => toggle(l)} />
            ))}
          </ul>
        )}
      </section>

      <section className="card" aria-labelledby="oo-title">
        <div className="card-head">
          <div>
            <h2 id="oo-title">One-order links</h2>
            <p className="text-[13px] text-slate-grey">A link for a single order. It stops taking payments when it expires.</p>
          </div>
        </div>
        {orders.error && !orders.data ? (
          <ErrorState message={errorMessage(orders.error)} onRetry={orders.reload} />
        ) : orders.firstLoad ? (
          <div className="p-6">
            <LoadingCard rows={2} />
          </div>
        ) : (orders.data ?? []).length === 0 ? (
          <Empty
            icon="bag"
            title="No one-order links yet"
            action={
              <Link href="/checkout-links/new?type=order" className="btn btn-secondary btn-sm">
                Create a one-order link
              </Link>
            }
          >
            Make a link for one buyer&apos;s order and send it to them in a chat.
          </Empty>
        ) : (
          <div className="table-scroll tall">
            <table className="dt">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="r">
                    Amount
                  </th>
                  <th scope="col">Expires</th>
                  <th scope="col">Coin · network</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {(orders.data ?? []).map((o) => (
                  <OrderRow key={o.id} order={o} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function ProductLinkCard({ link, busy, onToggle }: { link: ProductLink; busy: boolean; onToggle: () => void }) {
  const url = productLinkUrl(link.reference);
  return (
    <li className="lk flex flex-col">
      <div className="lk-top">
        <div className="lk-name">{link.title}</div>
        <span className={`badge ${link.active ? "b-active" : "b-off"}`}>{link.active ? "Active" : "Off"}</span>
      </div>
      {link.description ? <p className="mt-1 text-[13px] text-slate-grey">{link.description}</p> : null}
      <div className="lk-url-row">
        <span className="lk-url" title={url}>
          {withoutScheme(url)}
        </span>
        <CopyButton text={url} label={`Copy link for ${link.title}`} toastMessage="Link copied" />
      </div>
      <div className="lk-stats num">
        <div>
          <span>Price</span>
          <b>{formatMoney(link.amount, link.currency)}</b>
        </div>
        <div>
          <span>Sales</span>
          <b>{link.salesCount}</b>
        </div>
        <div>
          <span>Total</span>
          <b>{formatMoney(link.totalReceived, link.currency)}</b>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
        <CoinNet asset={link.cryptoAsset} network={link.network} />
        <div className="flex gap-2">
          <a className="btn btn-ghost btn-sm" href={`/pay/links/${link.reference}`} target="_blank" rel="noopener noreferrer">
            Preview
            <Icon name="ext" className="icon icon-xs" />
          </a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onToggle} disabled={busy} aria-label={`${link.active ? "Turn off" : "Turn on"} ${link.title}`}>
            {busy ? "Saving…" : link.active ? "Turn off" : "Turn on"}
          </button>
        </div>
      </div>
    </li>
  );
}

function OrderRow({ order }: { order: Invoice }) {
  const title = order.externalOrderId ? `Order #${order.externalOrderId}` : order.buyerName ? `Order from ${order.buyerName}` : order.invoiceNumber;
  const open = order.status === "PENDING" || order.status === "PARTIALLY_PAID" || order.status === "OVERDUE";
  const expires = order.expiresAt ? new Date(order.expiresAt) : null;
  return (
    <tr>
      <td className="c-who m-a">
        <div className="who">
          <span className="av order" aria-hidden="true">
            <Icon name="bag" className="icon icon-sm" />
          </span>
          <div className="min-w-0">
            <Link href={`/invoices/${order.id}`}>
              <b>{title}</b>
            </Link>
            <span className="sub">
              {order.description ?? "No description"}
              {order.buyerName && order.externalOrderId ? ` · ${order.buyerName}` : ""}
            </span>
          </div>
        </div>
      </td>
      <td className="m-d">
        <StatusBadge status={order.status} />
      </td>
      <td className="r num m-b">
        <span className="amt-main">{formatMoney(order.amount, order.currency)}</span>
        {!isZero(order.amountReceived) && order.status !== "PAID" ? <span className="sub">{formatMoney(order.amountOutstanding, order.currency)} owed</span> : null}
      </td>
      <td className="num m-e">
        {expires ? (
          order.status === "PAID" ? (
            <span className="dash">Paid</span>
          ) : order.status === "EXPIRED" ? (
            <span className="dash">Expired {formatDate(order.expiresAt)}</span>
          ) : (
            formatDateTime(order.expiresAt)
          )
        ) : (
          <span className="dash">Never</span>
        )}
      </td>
      <td className="m-c">
        <CoinNet asset={order.cryptoAsset} network={order.network} />
      </td>
      <td className="r m-f">
        <div className="inline-flex items-center gap-2">
          {open ? <CopyButton text={payUrl(order.paymentReference)} label={`Copy link for ${title}`} toastMessage="Link copied" /> : null}
          <Link href={`/invoices/${order.id}`} className="icon-btn" aria-label={`Open ${title}`}>
            <Icon name="chevronRight" className="icon icon-sm" />
          </Link>
        </div>
      </td>
    </tr>
  );
}
