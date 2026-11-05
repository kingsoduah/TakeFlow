"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AmountInput, amountError, cleanAmount, PairChoice, QuoteEstimate } from "@/components/forms";
import { Icon } from "@/components/icons";
import { CopyButton, CurrencySeg } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { useApp } from "@/lib/app-context";
import { useAsync } from "@/lib/hooks";
import { payUrl, productLinkUrl, withoutScheme } from "@/lib/links";
import { formatMoney } from "@/lib/money";
import { PAYMENT_PAIRS, type Currency, type PaymentPair } from "@/lib/types";

type LinkType = "product" | "order";

const EXPIRY: { minutes: number; label: string }[] = [
  { minutes: 60, label: "1 hour" },
  { minutes: 1440, label: "24 hours" },
  { minutes: 4320, label: "3 days" },
  { minutes: 10080, label: "7 days" },
  { minutes: 43200, label: "30 days" },
];

function urlError(s: string): string | null {
  if (!s.trim()) return null;
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? null : "Use a web address that starts with https://";
  } catch {
    return "Use a full web address, such as https://yourshop.com/thanks";
  }
}

export function NewCheckoutLinkView() {
  const { business, currency: displayCurrency, refreshNav } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<LinkType>(params.get("type") === "order" ? "order" : "product");
  const rates = useAsync(() => api.getRates(), []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState<Currency>(displayCurrency);
  const [amount, setAmount] = useState("");
  const [pair, setPair] = useState<PaymentPair>(PAYMENT_PAIRS[0]);
  const [returnUrl, setReturnUrl] = useState("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [orderId, setOrderId] = useState("");
  const [expiry, setExpiry] = useState(1440);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ url: string; name: string; price: string; detailHref?: string } | null>(null);

  const amtErr = amountError(amount);
  const titleErr = type === "product" && !title.trim() ? "Give the product a name." : null;
  const retErr = urlError(returnUrl);

  const switchType = (t: LinkType) => {
    setType(t);
    router.replace(`/checkout-links/new?type=${t}`, { scroll: false });
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (amtErr || titleErr || retErr) return;
    setBusy(true);
    setError(null);
    try {
      if (type === "product") {
        const l = await api.createProductLink(business.id, {
          title: title.trim(),
          description: description.trim() || undefined,
          amount: cleanAmount(amount),
          currency,
          cryptoAsset: pair.cryptoAsset,
          network: pair.network,
          returnUrl: returnUrl.trim() || undefined,
        });
        setCreated({ url: productLinkUrl(l.reference), name: l.title, price: formatMoney(l.amount, l.currency) });
      } else {
        const o = await api.createCheckout(business.id, {
          description: description.trim() || undefined,
          amount: cleanAmount(amount),
          currency,
          cryptoAsset: pair.cryptoAsset,
          network: pair.network,
          buyerName: buyerName.trim() || undefined,
          buyerEmail: buyerEmail.trim() || undefined,
          orderId: orderId.trim() || undefined,
          returnUrl: returnUrl.trim() || undefined,
          expiresInMinutes: expiry,
        });
        setCreated({
          url: payUrl(o.paymentReference),
          name: o.externalOrderId ? `Order #${o.externalOrderId}` : description.trim() || "One-order link",
          price: formatMoney(o.amount, o.currency),
          detailHref: `/invoices/${o.id}`,
        });
      }
      refreshNav();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <>
        <div className="page-head">
          <div>
            <Link href="/checkout-links" className="back">
              <Icon name="arrowLeft" className="icon icon-sm" />
              Checkout links
            </Link>
            <h1 className="mt-1">Your link is ready</h1>
          </div>
        </div>
        <section className="card card-body max-w-[640px] pt-6" role="status">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-mint text-navy">
              <Icon name="check" />
            </span>
            <div>
              <p className="font-semibold">{created.name}</p>
              <p className="text-[13px] text-ink-2 num">{created.price}</p>
            </div>
          </div>
          <p className="label mt-5">Share this link</p>
          <div className="copybox mt-1.5">
            <span className="val" title={created.url}>
              {withoutScheme(created.url)}
            </span>
            <CopyButton text={created.url} label="Copy the new link" toastMessage="Link copied" />
          </div>
          <p className="hint mt-2">Paste it into WhatsApp, Instagram, an email or a button on your website.</p>
          <div className="form-actions mt-6 justify-start">
            <a className="btn btn-primary" href={created.url} target="_blank" rel="noopener noreferrer">
              Open the payment page
              <Icon name="ext" className="icon icon-sm" />
            </a>
            {created.detailHref ? (
              <Link className="btn btn-secondary" href={created.detailHref}>
                Track this order
              </Link>
            ) : (
              <Link className="btn btn-secondary" href="/checkout-links">
                All checkout links
              </Link>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setCreated(null);
                setTitle("");
                setDescription("");
                setAmount("");
                setOrderId("");
                setBuyerName("");
                setBuyerEmail("");
                setTouched(false);
              }}
            >
              Make another
            </button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/checkout-links" className="back">
            <Icon name="arrowLeft" className="icon icon-sm" />
            Checkout links
          </Link>
          <h1 className="mt-1">New checkout link</h1>
          <p className="range">Price it in your currency. Buyers pay in a stablecoin.</p>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <form className="card card-body flex flex-col gap-5 pt-6" onSubmit={onSubmit} noValidate>
          <fieldset className="field">
            <legend className="label mb-1.5">What kind of link?</legend>
            <div className="choices" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              <label className="choice">
                <input type="radio" name="link-type" checked={type === "product"} onChange={() => switchType("product")} />
                <Icon name="link" className="icon flex-none" />
                <span className="min-w-0">
                  <span className="t">Product link</span>
                  <span className="s">Reusable. Many buyers can pay.</span>
                </span>
              </label>
              <label className="choice">
                <input type="radio" name="link-type" checked={type === "order"} onChange={() => switchType("order")} />
                <Icon name="bag" className="icon flex-none" />
                <span className="min-w-0">
                  <span className="t">One-order link</span>
                  <span className="s">For one buyer. It expires.</span>
                </span>
              </label>
            </div>
          </fieldset>

          {error ? (
            <div className="form-error" role="alert">
              <Icon name="alert" className="icon icon-sm" />
              {error}
            </div>
          ) : null}

          <div className="form-grid">
            {type === "product" ? (
              <div className="field span-2">
                <label className="label" htmlFor="title">
                  Product name
                </label>
                <input id="title" className="input" maxLength={120} placeholder="Website starter kit" value={title} onChange={(e) => setTitle(e.target.value)} aria-invalid={touched && !!titleErr} />
                {touched && titleErr ? <span className="error-text">{titleErr}</span> : null}
              </div>
            ) : null}
            <div className="field span-2">
              <label className="label" htmlFor="desc">
                {type === "product" ? "Description" : "What it's for"} <span className="opt">(optional)</span>
              </label>
              <input id="desc" className="input" maxLength={500} placeholder={type === "product" ? "Five-page template with a setup call" : "2 x hoodies, size M"} value={description} onChange={(e) => setDescription(e.target.value)} />
              <span className="hint">Buyers see this on the payment page.</span>
            </div>

            <div className="field span-2">
              <span className="label">Price currency</span>
              <CurrencySeg name="link-currency" value={currency} onChange={setCurrency} label={null} legend="Price currency" full />
            </div>
            <div className="field">
              <label className="label" htmlFor="amount">
                Price
              </label>
              <AmountInput id="amount" currency={currency} value={amount} onChange={setAmount} error={touched ? amtErr : null} describedBy="amount-err" />
              {touched && amtErr ? (
                <span id="amount-err" className="error-text">
                  {amtErr}
                </span>
              ) : null}
            </div>
            {type === "order" ? (
              <div className="field">
                <label className="label" htmlFor="expiry">
                  Link expires after
                </label>
                <select id="expiry" className="select" value={expiry} onChange={(e) => setExpiry(Number(e.target.value))}>
                  {EXPIRY.map((x) => (
                    <option key={x.minutes} value={x.minutes}>
                      {x.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div />
            )}

            <div className="span-2">
              <PairChoice name="link-pair" value={pair.id} onChange={setPair} />
            </div>

            {type === "order" ? (
              <>
                <div className="field">
                  <label className="label" htmlFor="buyer-name">
                    Buyer name <span className="opt">(optional)</span>
                  </label>
                  <input id="buyer-name" className="input" maxLength={120} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="buyer-email">
                    Buyer email <span className="opt">(optional)</span>
                  </label>
                  <input id="buyer-email" className="input" type="email" maxLength={254} value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} />
                </div>
                <div className="field">
                  <label className="label" htmlFor="order-id">
                    Your order ID <span className="opt">(optional)</span>
                  </label>
                  <input id="order-id" className="input" maxLength={100} placeholder="A-2302" value={orderId} onChange={(e) => setOrderId(e.target.value)} aria-describedby="order-id-hint" />
                  <span id="order-id-hint" className="hint">
                    Using the same ID twice gives you the same link.
                  </span>
                </div>
              </>
            ) : null}
            <div className={`field ${type === "order" ? "" : "span-2"}`}>
              <label className="label" htmlFor="return-url">
                Back to shop address <span className="opt">(optional)</span>
              </label>
              <input id="return-url" className="input" type="url" inputMode="url" placeholder="https://yourshop.com/thanks" value={returnUrl} onChange={(e) => setReturnUrl(e.target.value)} aria-invalid={touched && !!retErr} aria-describedby="return-url-hint" />
              {touched && retErr ? (
                <span className="error-text">{retErr}</span>
              ) : (
                <span id="return-url-hint" className="hint">
                  After paying, buyers see a Back to shop button.
                </span>
              )}
            </div>
          </div>

          <div className="form-actions">
            <Link href="/checkout-links" className="btn btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? "Creating the link…" : type === "product" ? "Create product link" : "Create one-order link"}
            </button>
          </div>
        </form>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[96px]">
          <QuoteEstimate amount={amount} currency={currency} pair={pair} rates={rates.data} windowMinutes={business.quoteWindowMinutes ?? 5} payer="buyer" />
        </aside>
      </div>
    </>
  );
}
