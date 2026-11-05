"use client";

import Link from "next/link";
import { CopyButton } from "@/components/ui";
import { productLinkUrl, withoutScheme } from "@/lib/links";
import { formatMoney, mulDec } from "@/lib/money";
import type { ProductLink } from "@/lib/types";

export function CheckoutLinksCard({ links }: { links: ProductLink[] }) {
  const shown = links.filter((l) => l.active).slice(0, 2);
  return (
    <section className="card stack-card rise" aria-labelledby="links-title" style={{ animationDelay: ".45s" }}>
      <div className="card-head">
        <h2 id="links-title">Checkout links</h2>
        <Link href="/checkout-links" className="btn btn-ghost btn-sm">
          All links
        </Link>
      </div>
      {shown.length === 0 ? (
        <div className="links-empty">
          <p>Sell a product with one link that many buyers can pay through.</p>
          <Link href="/checkout-links/new?type=product" className="btn btn-secondary btn-sm mt-3">
            Create a product link
          </Link>
        </div>
      ) : (
        <ul className="links">
          {shown.map((l) => (
            <LinkItem key={l.id} link={l} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function LinkItem({ link }: { link: ProductLink }) {
  const url = productLinkUrl(link.reference);
  return (
    <li className="lk">
      <div className="lk-top">
        <div className="lk-name">{link.title}</div>
        <span className={`badge ${link.active ? "b-active" : "b-off"}`}>{link.active ? "Active" : "Off"}</span>
      </div>
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
          <b>{formatMoney(link.totalReceived || mulDec(link.amount, String(link.salesCount)), link.currency)}</b>
        </div>
      </div>
    </li>
  );
}
