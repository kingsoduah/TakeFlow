"use client";

import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Logo } from "@/components/brand";
import { CoinGlyph, Icon } from "@/components/icons";
import { CoinNet, CopyButton, CurrencySeg, Skeleton } from "@/components/ui";
import { api, ApiError, errorMessage, USE_MOCKS } from "@/lib/api";
import { explorerFor, formatDate, formatDateTime, formatTime, initials, networkName, shortHash } from "@/lib/format";
import { useInterval, useNow } from "@/lib/hooks";
import { mockTools } from "@/lib/mock-api";
import { addDec, formatCrypto, formatMoney, isZero } from "@/lib/money";
import { CURRENCIES, type Currency, type PublicPayment, type PublicProductLink } from "@/lib/types";

const PAY_CCY_KEY = "takeflow.payDisplayCurrency";
const POLL_MS = 5000;
const QUOTE_THROTTLE_MS = 15_000;

function readPayCurrency(): Currency | null {
  try {
    const v = window.localStorage.getItem(PAY_CCY_KEY);
    return v && (CURRENCIES as readonly string[]).includes(v) ? (v as Currency) : null;
  } catch {
    return null;
  }
}

function publicError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503) return "Price unavailable, try again in a moment.";
    if (e.status === 502) return "We couldn't set up the payment address. Try again in a moment.";
    if (e.status === 429) return `Too many tries. Wait ${e.retryAfter ?? 30} seconds and try again.`;
    if (e.status === 0) return e.message;
  }
  return errorMessage(e);
}

// ---------- shell ----------

function PayShell({ children, currency, onCurrency }: { children: React.ReactNode; currency?: Currency; onCurrency?: (c: Currency) => void }) {
  return (
    <div className="pay-shell">
      <header className="pay-top">
        <Logo width={120} priority />
        {currency && onCurrency ? <CurrencySeg name="pay-currency" value={currency} onChange={onCurrency} label="Show in" legend="Show amounts in (for viewing only)" onCloud /> : null}
      </header>
      <main className="pay-main">{children}</main>
      <footer className="pay-foot">
        Payments are checked on the blockchain and matched for the business automatically.
        <br />
        <b>TakeFlow</b> · Every payment. Accounted for.
      </footer>
    </div>
  );
}

function PayMessage({ title, children, icon = "alert" }: { title: string; children: React.ReactNode; icon?: "alert" | "clock" | "info" }) {
  return (
    <PayShell>
      <section className="card pay-card">
        <div className="empty" role="alert">
          <div className="ic">
            <Icon name={icon} />
          </div>
          <h3>{title}</h3>
          <p>{children}</p>
        </div>
      </section>
    </PayShell>
  );
}

function PaySkeleton() {
  return (
    <PayShell>
      <section className="card pay-card" aria-busy="true" aria-label="Loading payment details">
        <div className="pay-head">
          <div className="biz">
            <Skeleton h={44} w={44} />
            <div className="flex flex-col gap-2">
              <Skeleton h={20} w={160} />
              <Skeleton h={14} w={220} />
            </div>
          </div>
        </div>
        <div className="pay-grid">
          <div className="pay-summary">
            <Skeleton h={44} w="70%" />
            <Skeleton h={90} />
          </div>
          <div className="pay-panel">
            <Skeleton h={40} w="60%" />
            <Skeleton h={70} />
            <Skeleton h={150} />
          </div>
        </div>
      </section>
    </PayShell>
  );
}

// ---------- product link: first step (/pay/links/<reference>) ----------

export function ProductLinkStep({ reference }: { reference: string }) {
  const router = useRouter();
  const [link, setLink] = useState<PublicProductLink | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.getProductLinkPage(reference).then(
      (l) => alive && setLink(l),
      (e: unknown) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [reference]);

  if (error) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PayMessage title={notFound ? "We couldn't find this link" : "This page didn't load"}>
        {notFound ? "Check the link with the shop that sent it." : publicError(error)}
      </PayMessage>
    );
  }
  if (!link) return <PaySkeleton />;
  if (!link.active) {
    return (
      <PayMessage title="This link is turned off" icon="info">
        {link.businessName} is not taking payments through this link right now. Ask them for a new one.
      </PayMessage>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const p = await api.startProductCheckout(reference, { buyerName: name.trim() || undefined, buyerEmail: email.trim() || undefined });
      router.replace(`/pay/${p.paymentReference}`);
    } catch (err) {
      setFormError(err instanceof ApiError && err.status === 410 ? "This link was just turned off. Ask the shop for a new one." : publicError(err));
      setBusy(false);
    }
  };

  return (
    <PayShell>
      <section className="card pay-card rise">
        <div className="pay-head">
          <div className="biz">
            <div className="biz-mark" aria-hidden="true">
              {initials(link.businessName)}
            </div>
            <div className="min-w-0">
              <h1>{link.businessName}</h1>
              <p className="pay-for">Checkout</p>
            </div>
          </div>
        </div>
        <div className="pay-grid">
          <div className="pay-summary">
            <div>
              <p className="eyebrow">You&apos;re buying</p>
              <h2 className="mt-1 text-[22px] font-extrabold">{link.title}</h2>
              {link.description ? <p className="mt-1 text-ink-2">{link.description}</p> : null}
            </div>
            <div>
              <p className="eyebrow">Price</p>
              <p className="owed-big num mt-1">{formatMoney(link.amount, link.currency)}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              You pay in <CoinNet asset={link.cryptoAsset} network={link.network} />
            </div>
            {link.indicative ? (
              <p className="hint num">
                About {formatCrypto(link.indicative.cryptoAmount, link.cryptoAsset)} at the rate from {formatTime(link.indicative.rateFetchedAt)}. You&apos;ll see the exact amount on the next step.
              </p>
            ) : null}
          </div>
          <form className="pay-panel" onSubmit={onSubmit}>
            <div>
              <h2 className="text-[18px] font-bold">Your details</h2>
              <p className="mt-1 text-[13px] text-ink-2">Both are optional. The shop sees them with your order.</p>
            </div>
            {formError ? (
              <div className="form-error" role="alert">
                <Icon name="alert" className="icon icon-sm" />
                {formError}
              </div>
            ) : null}
            <div className="field">
              <label className="label" htmlFor="buyer-name">
                Name <span className="opt">(optional)</span>
              </label>
              <input id="buyer-name" className="input" autoComplete="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label className="label" htmlFor="buyer-email">
                Email <span className="opt">(optional)</span>
              </label>
              <input id="buyer-email" className="input" type="email" autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="buyer-email-hint" />
              <span id="buyer-email-hint" className="hint">
                So the shop can send your receipt.
              </span>
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? "Getting your payment details…" : "Continue to payment"}
              {busy ? null : <Icon name="arrowRight" className="icon icon-sm" />}
            </button>
            <p className="hint">Next you&apos;ll see the exact amount to send. The price is held for up to 5 minutes.</p>
          </form>
        </div>
      </section>
    </PayShell>
  );
}

// ---------- invoice or checkout payment (/pay/<paymentReference>) ----------

interface Loaded {
  page: PublicPayment;
  skew: number; // server clock minus this device's clock, ms
}

function withSkew(page: PublicPayment): Loaded {
  const skew = Date.parse(page.serverTime) - Date.now();
  return { page, skew: Number.isFinite(skew) ? skew : 0 };
}

export function PaymentView({ reference }: { reference: string }) {
  const [state, setState] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<{ status: number; message: string } | null>(null);
  const [chosen, setChosen] = useState<Currency | null>(null);
  const now = useNow(1000);
  const chosenRef = useRef<Currency | null>(null);
  const inFlight = useRef(false);
  const lastQuoteAt = useRef(0);
  const expiredFor = useRef<string | null>(null);

  // POST /pay/:ref/quote: when the payer opens the page, when a countdown
  // runs out, and when a part payment changes what is owed. Never on polls.
  const quote = useCallback(
    (force = false) => {
      if (!force && Date.now() - lastQuoteAt.current < QUOTE_THROTTLE_MS) return;
      lastQuoteAt.current = Date.now();
      setQuoting(true);
      api
        .requestQuote(reference, chosenRef.current)
        .then(
          (p) => {
            setState(withSkew(p));
            setQuoteError(null);
          },
          (e: unknown) => {
            const status = e instanceof ApiError ? e.status : 0;
            if (status === 409 || status === 410) {
              // Paid, nothing owed, or expired: the read shows which.
              api.getPayment(reference, chosenRef.current).then((p) => setState(withSkew(p)), setError);
              setQuoteError(status === 410 ? { status, message: "This checkout has expired." } : null);
              return;
            }
            setQuoteError({ status, message: publicError(e) });
          },
        )
        .finally(() => setQuoting(false));
    },
    [reference],
  );

  // GET /pay/:ref: read only. Polled about every 5 seconds.
  const load = useCallback(
    (display?: Currency | null) => {
      if (inFlight.current) return;
      inFlight.current = true;
      api
        .getPayment(reference, display === undefined ? chosenRef.current : display)
        .then(
          (p) => {
            setState(withSkew(p));
            setError(null);
            if (p.payable && !p.quote) quote();
          },
          (e: unknown) => setError(e),
        )
        .finally(() => {
          inFlight.current = false;
        });
    },
    [reference, quote],
  );

  useEffect(() => {
    const stored = readPayCurrency();
    chosenRef.current = stored;
    const t = setTimeout(() => {
      if (stored) setChosen(stored);
      load(stored);
    }, 0);
    return () => clearTimeout(t);
  }, [load]);

  const page = state?.page;
  const open = !!page && page.payable;
  useInterval(() => load(), open ? POLL_MS : null);

  // A countdown that ran out asks for a fresh price, once per quote.
  const q = page?.quote ?? null;
  const skew = state?.skew ?? 0;
  const msLeft = q && now ? Date.parse(q.expiresAt) - (now + skew) : null;
  useInterval(
    () => {
      if (!open || !q || quoting) return;
      if (Date.parse(q.expiresAt) - (Date.now() + skew) <= 0 && expiredFor.current !== q.expiresAt) {
        expiredFor.current = q.expiresAt;
        quote(true);
      }
    },
    open && q ? 1000 : null,
  );

  const onCurrency = (c: Currency) => {
    setChosen(c);
    chosenRef.current = c;
    try {
      window.localStorage.setItem(PAY_CCY_KEY, c);
    } catch {
      // view-only preference; fine to lose
    }
    inFlight.current = false;
    load(c);
  };

  if (error && !page) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <PayMessage title={notFound ? "We couldn't find this payment" : "This page didn't load"}>
        {notFound ? "Check the link with the business that sent it." : publicError(error)}
      </PayMessage>
    );
  }
  if (!page) return <PaySkeleton />;

  const display = chosen ?? page.currency;
  const expired = page.status === "EXPIRED" || quoteError?.status === 410;
  const kindLabel = page.kind === "CHECKOUT" ? "Order" : "Invoice";
  const forLine = `${kindLabel} ${page.invoiceNumber}${page.description ? ` · ${page.description}` : ""}`;

  const statusBadge =
    page.status === "PAID" ? (
      <span className="badge b-paid">Paid</span>
    ) : expired ? (
      <span className="badge b-draft">Expired</span>
    ) : page.status === "PARTIALLY_PAID" ? (
      <span className="badge b-partial">Partly paid</span>
    ) : page.status === "OVERDUE" ? (
      <span className="badge b-overdue">Overdue</span>
    ) : (
      <span className="badge b-waiting">Waiting for payment</span>
    );

  return (
    <PayShell currency={display} onCurrency={onCurrency}>
      <section className="card pay-card rise" aria-labelledby="pay-business">
        <div className="pay-head">
          <div className="biz">
            <div className="biz-mark" aria-hidden="true">
              {initials(page.businessName)}
            </div>
            <div className="min-w-0">
              <h1 id="pay-business">{page.businessName}</h1>
              <p className="pay-for">{forLine}</p>
            </div>
          </div>
          {statusBadge}
        </div>

        {page.status === "PAID" ? (
          <Receipt page={page} />
        ) : expired || !page.payable ? (
          <div className="empty">
            <div className="ic">
              <Icon name="clock" />
            </div>
            <h3>{expired ? "This checkout has expired" : "This payment is closed"}</h3>
            <p>{expired ? `It is no longer taking payments. Ask ${page.businessName} for a new link.` : `${page.businessName} is not taking payments here right now.`}</p>
          </div>
        ) : (
          <>
            <div className="pay-grid">
              <Summary page={page} display={display} />
              <Panel page={page} msLeft={msLeft} quoting={quoting} quoteError={quoteError} onRetry={() => quote(true)} />
            </div>
            <StatusStrip page={page} />
          </>
        )}
      </section>

      {USE_MOCKS && open ? (
        <div className="mock-tools" role="group" aria-label="Sample data controls">
          <b>Sample data.</b> Try the page:
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              mockTools.simulatePayment(reference, "part");
              load();
            }}
          >
            Send part of it
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              mockTools.simulatePayment(reference, "full");
              load();
            }}
          >
            Send the full amount
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              mockTools.expireQuote(reference);
              load();
            }}
          >
            End the price hold in 8 seconds
          </button>
        </div>
      ) : null}
    </PayShell>
  );
}

// Amounts in the payer's chosen currency come from the API (display).
function approxLine(page: PublicPayment, field: "amount" | "amountReceived" | "amountOutstanding", display: Currency): string | null {
  const d = page.display;
  if (!d || d.currency === page.currency || d.currency !== display) return null;
  return `≈ ${formatMoney(d[field], d.currency)}`;
}

function Summary({ page, display }: { page: PublicPayment; display: Currency }) {
  const m = (v: string) => formatMoney(v, page.currency);
  const owedApprox = approxLine(page, "amountOutstanding", display);
  const priceApprox = approxLine(page, "amount", display);
  const paidApprox = approxLine(page, "amountReceived", display);
  return (
    <div className="pay-summary">
      <div>
        <p className="eyebrow">{page.status === "PARTIALLY_PAID" ? "Still to pay" : "Amount to pay"}</p>
        <p className="owed-big num mt-1">{m(page.amountOutstanding)}</p>
        {owedApprox ? <p className="approx num">{owedApprox} · for reference only</p> : null}
      </div>
      <dl className="lines num">
        <div>
          <dt>Price</dt>
          <dd>
            {m(page.amount)}
            {priceApprox ? <span className="sub">{priceApprox}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Paid so far</dt>
          <dd>
            {m(page.amountReceived)}
            {!isZero(page.amountReceived) && paidApprox ? <span className="sub">{paidApprox}</span> : null}
          </dd>
        </div>
        <div>
          <dt>Still owed</dt>
          <dd>{m(page.amountOutstanding)}</dd>
        </div>
        {page.dueDate ? (
          <div>
            <dt>Due</dt>
            <dd>{formatDate(page.dueDate, { year: true })}</dd>
          </div>
        ) : null}
      </dl>
      {owedApprox ? (
        <p className="hint">
          You owe {m(page.amountOutstanding)}. Amounts in {display} are for reference only
          {page.display?.rateFetchedAt ? `, at the rate from ${formatTime(page.display.rateFetchedAt)}` : ""}.
        </p>
      ) : null}
      {page.payments.length > 0 ? (
        <PaymentsList page={page} />
      ) : page.quote && page.address ? (
        <div>
          <p className="eyebrow">How to pay</p>
          <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[14px] text-ink-2">
            <li>Open the wallet or exchange you pay from.</li>
            <li>
              Send exactly <b className="font-semibold text-navy num">{formatCrypto(page.quote.cryptoAmount, page.quote.cryptoAsset)}</b> on {networkName(page.network)}.
            </li>
            <li>Keep this page open. It shows your receipt once the payment arrives.</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}

function PaymentsList({ page }: { page: PublicPayment }) {
  return (
    <div>
      <p className="eyebrow">Payments received</p>
      <ul className="mt-2 flex flex-col gap-2">
        {page.payments.map((p) => {
          const ex = explorerFor(p.network);
          return (
            <li key={p.transactionHash} className="flex items-center justify-between gap-3 rounded-[8px] border border-line px-3 py-2 text-[13px]">
              <span className="num">
                <b className="font-semibold">{p.valueAmount && p.valueCurrency ? formatMoney(p.valueAmount, p.valueCurrency) : formatCrypto(p.amount, p.asset)}</b>
                <span className="sub">
                  {formatCrypto(p.amount, p.asset)} · {formatDateTime(p.depositedAt ?? p.receivedAt)}
                </span>
              </span>
              {ex ? (
                <a className="hash" href={ex.tx(p.transactionHash)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${shortHash(p.transactionHash)} on ${ex.name} (opens in a new tab)`}>
                  {shortHash(p.transactionHash)}
                  <Icon name="ext" />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Panel({ page, msLeft, quoting, quoteError, onRetry }: { page: PublicPayment; msLeft: number | null; quoting: boolean; quoteError: { status: number; message: string } | null; onRetry: () => void }) {
  const q = page.quote;

  if (!q || !page.address) {
    const unavailable = quoteError?.status === 503;
    return (
      <div className="pay-panel">
        <div className="empty" style={{ padding: "24px 8px" }}>
          <div className="ic">
            <Icon name={quoteError ? "alert" : "clock"} />
          </div>
          <h3>{unavailable ? "The price is unavailable right now" : quoteError ? "We couldn't get your price" : "Getting your price"}</h3>
          <p>
            {unavailable
              ? "We can't get a current exchange rate, so we won't guess one. Please try again in a moment."
              : quoteError
                ? quoteError.message
                : "One moment while we work out the exact amount to send."}
          </p>
          {quoteError ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry} disabled={quoting}>
              <Icon name="refresh" className="icon icon-sm" />
              {quoting ? "Trying…" : "Try again"}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  const total = Math.max(1, Date.parse(q.expiresAt) - Date.parse(q.createdAt));
  const left = msLeft == null ? total : Math.max(0, msLeft);
  const ended = msLeft != null && msLeft <= 0;
  const mm = Math.floor(left / 60000);
  const ss = Math.floor((left % 60000) / 1000);
  const low = left < 30_000;
  const delayed = (Date.parse(q.createdAt) - Date.parse(q.rateFetchedAt)) / 60000 > 5;
  const net = networkName(page.network);
  const amountText = formatCrypto(q.cryptoAmount, q.cryptoAsset).replace(` ${q.cryptoAsset}`, "");

  return (
    <div className="pay-panel">
      <div>
        <p className="eyebrow">Send exactly</p>
        <div className="send-amt mt-1">
          <span className="num">{amountText}</span>
          <span className="asset inline-flex items-center gap-2">
            <CoinGlyph asset={q.cryptoAsset} className="h-6 w-6" />
            {q.cryptoAsset}
          </span>
          <CopyButton text={q.cryptoAmount} label={`Copy the amount, ${formatCrypto(q.cryptoAmount, q.cryptoAsset)}`} toastMessage="Amount copied" />
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          on the <b className="font-semibold text-navy">{net}</b> network
        </p>
      </div>

      <div className={`timer${low ? " low" : ""}`}>
        <div className="timer-row">
          {quoting || ended ? (
            <span role="status">
              <b>Getting a new price…</b>
            </span>
          ) : (
            <span>
              Price held for <b className="num">{msLeft == null ? `${Math.round(total / 60000)}:00` : `${mm}:${String(ss).padStart(2, "0")}`}</b>
            </span>
          )}
          <span className="num">
            Rate from {formatTime(q.rateFetchedAt)} · 1 {q.cryptoAsset} = {formatMoney(q.rate, page.currency, page.currency === "NGN" ? 0 : 2)}
          </span>
        </div>
        <div className="timer-bar" aria-hidden="true">
          <i style={{ width: `${(left / total) * 100}%` }} />
        </div>
        {delayed ? <p className="hint">Live rates are delayed right now, so this price uses the rate from {formatTime(q.rateFetchedAt)}.</p> : null}
        {quoteError ? (
          <p className="error-text" role="alert">
            {quoteError.message}{" "}
            <button type="button" className="link" onClick={onRetry}>
              Try again
            </button>
          </p>
        ) : null}
      </div>

      <div className="addr">
        <div className="qr" aria-hidden="true">
          <QRCodeSVG value={page.address} size={132} level="M" marginSize={0} fgColor="#101D30" />
        </div>
        <div className="min-w-0">
          <p className="eyebrow">To this address</p>
          <p className="addr-text mt-1">{page.address}</p>
          <div className="mt-2">
            <CopyButton variant="small" text={page.address} label="Copy the payment address" done="Address copied" toastMessage="Address copied">
              Copy address
            </CopyButton>
          </div>
        </div>
      </div>

      <p className="note warn">
        <Icon name="alert" className="icon icon-sm" />
        <span>
          Send <b>{q.cryptoAsset}</b> on <b>{net}</b> only. Coins sent on any other network can&apos;t be recovered.
        </span>
      </p>
      <p className="hint">If you send this amount before the timer ends, it counts at this rate. After that, a new price is worked out for you.</p>
    </div>
  );
}

function StatusStrip({ page }: { page: PublicPayment }) {
  const m = (v: string) => formatMoney(v, page.currency);
  if (page.status === "PARTIALLY_PAID") {
    return (
      <div className="pay-status" role="status" aria-live="polite">
        <span className="pulse amber" aria-hidden="true" />
        <span className="t">Part payment received</span>
        <span className="s num">
          {m(page.amountReceived)} is in. Send the {m(page.amountOutstanding)} still owed to finish.
        </span>
      </div>
    );
  }
  return (
    <div className="pay-status" role="status" aria-live="polite">
      <span className="pulse" aria-hidden="true" />
      <span className="t">Waiting for your payment</span>
      <span className="s">This page updates by itself. Keep it open until you see your receipt.</span>
    </div>
  );
}

function Receipt({ page }: { page: PublicPayment }) {
  const m = (v: string) => formatMoney(v, page.currency);
  const sent = page.payments.reduce((a, p) => addDec(a, p.amount), "0");
  const asset = page.payments[0]?.asset ?? page.cryptoAsset;
  const last = page.payments[page.payments.length - 1];
  const paidAt = last ? last.depositedAt ?? last.receivedAt : null;
  const priceApprox = page.display && page.display.currency !== page.currency ? `≈ ${formatMoney(page.display.amountReceived, page.display.currency)}` : null;
  return (
    <div className="receipt">
      <div className="done" aria-hidden="true">
        <Icon name="check" />
      </div>
      <div>
        <h2>Payment received</h2>
        <p className="mt-1 text-ink-2 num">
          {m(page.amountReceived)} paid to {page.businessName}
          {priceApprox ? ` (${priceApprox})` : ""}. Thank you.
        </p>
      </div>
      <div className="receipt-box">
        <dl className="dl num">
          <dt>Paid for</dt>
          <dd>{page.description ?? (page.kind === "CHECKOUT" ? "Order" : "Invoice")}</dd>
          <dt>Reference</dt>
          <dd>{page.invoiceNumber}</dd>
          <dt>Price</dt>
          <dd>{m(page.amount)}</dd>
          <dt>You sent</dt>
          <dd>
            {formatCrypto(sent, asset)} on {networkName(page.network)}
          </dd>
          {paidAt ? (
            <>
              <dt>Paid on</dt>
              <dd>
                {formatDate(paidAt, { year: true })}, {formatTime(paidAt)}
              </dd>
            </>
          ) : null}
          <dt>{page.payments.length > 1 ? "Transactions" : "Transaction"}</dt>
          <dd className="flex flex-col gap-1">
            {page.payments.map((p) => {
              const ex = explorerFor(p.network);
              return ex ? (
                <a key={p.transactionHash} className="hash" style={{ margin: 0, padding: 0 }} href={ex.tx(p.transactionHash)} target="_blank" rel="noopener noreferrer" aria-label={`View transaction ${shortHash(p.transactionHash)} on ${ex.name} (opens in a new tab)`}>
                  {shortHash(p.transactionHash, 6)} on {ex.name}
                  <Icon name="ext" />
                </a>
              ) : (
                <span key={p.transactionHash} className="mono">
                  {shortHash(p.transactionHash, 6)}
                </span>
              );
            })}
          </dd>
        </dl>
      </div>
      <div className="flex w-full max-w-[520px] flex-wrap justify-center gap-3">
        {page.returnUrl ? (
          <a className="btn btn-primary btn-lg" href={page.returnUrl}>
            Back to shop
            <Icon name="arrowRight" className="icon icon-sm" />
          </a>
        ) : null}
        <button type="button" className="btn btn-secondary btn-lg" onClick={() => window.print()}>
          <Icon name="print" className="icon icon-sm" />
          Print receipt
        </button>
      </div>
    </div>
  );
}
