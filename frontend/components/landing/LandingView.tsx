"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "@/components/brand";
import { CoinGlyph, Icon } from "@/components/icons";
import { copyText } from "@/components/ui";
import s from "./landing.module.css";

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

const CODE = `const res = await fetch(\`\${process.env.TAKEFLOW_API_URL}/api/v1/checkouts\`, {
  method: "POST",
  headers: {
    "X-Api-Key": process.env.TAKEFLOW_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    amount: "343750.00",
    currency: "NGN",
    cryptoAsset: "USDT",
    network: "trc20",
    orderId: "A-2291",
    description: "Website starter kit",
    returnUrl: "https://yourshop.com/thanks",
  }),
});
const checkout = await res.json();
// Send your customer to /pay/<checkout.paymentReference>`;

const NAV = [
  { href: "#top", label: "Home" },
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#developers", label: "Developers" },
  { href: "#security", label: "Security" },
];

// ---------- motion helpers (all optional: the page reads fine without them) ----------

function motionAllowed() {
  return typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window;
}

// Counts up from 0 once `run` turns true. Before that it shows the real value.
function useCountUp(target: number, run: boolean, decimals = 0, duration = 1100) {
  const [value, setValue] = useState(target);
  useEffect(() => {
    if (!run || !motionAllowed()) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const e = 1 - Math.pow(1 - p, 4);
      setValue(Number((target * e).toFixed(decimals)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [run, target, decimals, duration]);
  return value;
}

// The 5-minute price hold, ticking down and starting again.
function useHold() {
  const [left, setLeft] = useState(299);
  useEffect(() => {
    const id = setInterval(() => setLeft((l) => (l <= 0 ? 300 : l - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  return left;
}

type Beat = "final" | "start" | "play" | "done";

export function LandingView() {
  const root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [arrive, setArrive] = useState<Beat>("final");
  const [matched, setMatched] = useState<Beat>("final");
  const [money, setMoney] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const left = useHold();

  // Scroll reveals and story beats. Elements already on screen are left
  // alone; elements below the fold play their entrance when they arrive.
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 50);
    const el = root.current;
    if (!el || !motionAllowed()) return () => clearTimeout(t);
    const below = (n: Element) => n.getBoundingClientRect().top > window.innerHeight;
    const arriveEl = el.querySelector("[data-beat='arrive']");
    const matchedEl = el.querySelector("[data-beat='matched']");
    const pre = setTimeout(() => {
      if (arriveEl && below(arriveEl)) setArrive("start");
      if (matchedEl && below(matchedEl)) setMatched("start");
    }, 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const n = e.target as HTMLElement;
          io.unobserve(n);
          if (n.dataset.reveal !== undefined) n.classList.add(s.revealed);
          const beat = n.dataset.beat;
          if (beat === "arrive") {
            timers.push(setTimeout(() => setArrive((b) => (b === "start" ? "play" : b)), 450));
            timers.push(setTimeout(() => setArrive((b) => (b === "play" ? "done" : b)), 1900));
          }
          if (beat === "matched") timers.push(setTimeout(() => setMatched((b) => (b === "start" ? "done" : b)), 700));
          if (beat === "money") setMoney(true);
        }
      },
      // Fires just before the element scrolls in, so the rise starts off screen.
      { threshold: 0, rootMargin: "0px 0px 40px 0px" },
    );
    el.querySelectorAll<HTMLElement>("[data-reveal], [data-beat]").forEach((n) => {
      if (below(n)) io.observe(n);
    });
    return () => {
      clearTimeout(t);
      clearTimeout(pre);
      timers.forEach(clearTimeout);
      io.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        menuBtn.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menu]);

  const currencies = useCountUp(5, loaded);
  const networks = useCountUp(3, loaded);
  const lock = useCountUp(5, loaded);
  const paid = useCountUp(39719.21, money, 2, 1300);

  const copy = useCallback(async () => {
    await copyText(CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, []);

  const hold = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  const ring = 175.93;

  return (
    <div className={s.root} ref={root}>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="gTeal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#C9F5E9" />
            <stop offset=".45" stopColor="#5FD6BC" />
            <stop offset="1" stopColor="#13B89A" />
          </linearGradient>
          <linearGradient id="gDeep" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#13B89A" />
            <stop offset="1" stopColor="#0B6F5E" />
          </linearGradient>
          <linearGradient id="gShine" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".75" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      {/* ============================ HERO ============================ */}
      <header className={s.hero} id="top">
        <div className={s.wrap}>
          <nav className={cx(s.nav, s.dark)} aria-label="Main">
            <a href="#top" className={s.logoLink} aria-label="TakeFlow home">
              <Logo onNavy width={148} priority />
            </a>
            <ul className={s.navPill}>
              {NAV.map((n, i) => (
                <li key={n.href}>
                  <a href={n.href} aria-current={i === 0 ? "page" : undefined}>
                    {n.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className={s.navRight}>
              <Link href="/sign-in" className={s.signin}>
                <Icon name="user" className={s.icon} />
                <span>Sign in</span>
              </Link>
              <button ref={menuBtn} type="button" className={s.menuBtn} aria-label={menu ? "Close menu" : "Open menu"} aria-expanded={menu} aria-controls="lp-mnav" onClick={() => setMenu((m) => !m)}>
                <Icon name={menu ? "close" : "menu2"} className={s.icon} />
              </button>
            </div>
            <div className={cx(s.mnav, menu && s.mnavOpen)} id="lp-mnav" hidden={!menu}>
              <ul>
                {NAV.map((n) => (
                  <li key={n.href}>
                    <a href={n.href} onClick={() => setMenu(false)}>
                      {n.label}
                    </a>
                  </li>
                ))}
                <li>
                  <Link href="/sign-up" onClick={() => setMenu(false)}>
                    Get started
                  </Link>
                </li>
              </ul>
            </div>
          </nav>

          <div className={cx(s.heroHead, s.dark)}>
            <span className={cx(s.eyebrow, s.onDark)}>
              <span className={s.dot} />
              Built on Roqqu API Services
            </span>
            <h1>
              <span>Every payment.</span>
              <span className={s.soft}>Accounted for.</span>
            </h1>
          </div>

          <div className={s.heroRow}>
            <div className={cx(s.heroCopy, s.dark)}>
              <p>
                Bill in <b>NGN, USD, GBP, EUR or GHS</b>, get paid in USDT or USDC, and see every payment matched to its invoice.
              </p>
              <div className={s.ctaRow}>
                <Link href="/sign-up" className={cx(s.btn, s.btnPrimary)}>
                  Get started
                </Link>
                <a href="#how" className={cx(s.btn, s.btnRound)} aria-label="See how it works">
                  <Icon name="up" className={s.icon} />
                </a>
              </div>
            </div>

            <div className={s.stage} role="img" aria-label="Three stacked cards: invoice INV-1042 for Northgate Labs, £1,000.00 due 20 Nov; a payment of 1,333.34 USDT on TRC20, matched; and the invoice marked paid in full.">
              <div className={s.scaler}>
                <div className={s.ground} />
                <div className={s.iso} aria-hidden="true">
                  <div className={cx(s.card, s.cardNavy)}>
                    <div className={s.band2}>
                      <div>
                        <div className={s.k}>INV-1042 · Northgate Labs</div>
                        <div className={s.big}>£1,000.00</div>
                      </div>
                      <span className={s.due}>Due 20 Nov</span>
                    </div>
                  </div>
                  <div className={cx(s.card, s.cardTeal)}>
                    <div className={s.band2}>
                      <div>
                        <div className={s.k}>TRC20 · from TQ8m…v4Jk</div>
                        <div className={s.big}>1,333.34 USDT</div>
                      </div>
                      <span className={cx(s.badge, s.bPaid)}>Matched</span>
                    </div>
                  </div>
                  <div className={cx(s.card, s.cardGlass)}>
                    <div className={s.cardTop}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/brand/takeflow-symbol.png" alt="" width={34} height={30} style={{ width: 34, height: "auto" }} />
                      <span className={s.chk}>
                        <Icon name="check" className={s.icon} />
                      </span>
                    </div>
                    <div className={s.paidText}>Paid in full</div>
                    <div className={s.cardSub}>INV-1042 · £1,000.00 received</div>
                    <div className={s.prog}>
                      <i />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className={s.facts}>
              <div className={s.fact}>
                <div className={cx(s.factN, s.num)}>{currencies}</div>
                <div className={s.factL}>Currencies</div>
                <div className={s.factS}>NGN · USD · GBP · EUR · GHS</div>
              </div>
              <div className={s.fact}>
                <div className={cx(s.factN, s.num)}>{networks}</div>
                <div className={s.factL}>Stablecoin networks</div>
                <div className={s.factS}>USDT TRC20 · USDT BEP20 · USDC Base</div>
              </div>
              <div className={s.fact}>
                <div className={cx(s.factN, s.num)}>
                  {lock}
                  <small>min</small>
                </div>
                <div className={s.factL}>Price lock</div>
                <div className={s.factS}>Live Roqqu rate, held with a countdown</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* ============================ PAY WITH ============================ */}
        <section className={s.paywith} id="security" aria-labelledby="pw-title" style={{ scrollMarginTop: 16 }}>
          <div className={s.wrap}>
            <h2 id="pw-title" data-reveal="">
              Pay with
            </h2>
            <div className={s.pwGrid}>
              <div className={s.tile} data-reveal="">
                <CoinGlyph asset="USDT" />
                <span>USDT</span>
              </div>
              <div className={s.tile} data-reveal="" style={{ ["--rd" as string]: ".05s" }}>
                <CoinGlyph asset="USDC" />
                <span>USDC</span>
              </div>
              <div className={s.tile} data-reveal="" style={{ ["--rd" as string]: ".1s" }}>
                <NetMark kind="tron" />
                <span>Tron</span>
              </div>
              <div className={s.tile} data-reveal="" style={{ ["--rd" as string]: ".15s" }}>
                <NetMark kind="bnb" />
                <span>BNB Smart Chain</span>
              </div>
              <div className={s.tile} data-reveal="" style={{ ["--rd" as string]: ".2s" }}>
                <NetMark kind="base" />
                <span>Base</span>
              </div>
              <div className={s.verifyNote} data-reveal="" style={{ ["--rd" as string]: ".25s" }}>
                <span className={s.sh}>
                  <Icon name="shield" className={s.icon} />
                </span>
                <div>
                  <b>Every payment verified with Roqqu</b>
                  <span>No invoice is marked paid until Roqqu confirms the deposit.</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ============================ STATEMENT ============================ */}
        <section className={s.statement} aria-label="What TakeFlow does">
          <div className={s.wrap}>
            <p data-reveal="">
              Invoice in your currency, get paid in stablecoins, and know exactly what&apos;s paid <span className={s.fade}>and what&apos;s still owed.</span>
            </p>
          </div>
        </section>

        {/* ============================ BENTO ============================ */}
        <section className={s.sec} id="features" aria-labelledby="feat-title" style={{ paddingTop: "var(--sp-4)" }}>
          <div className={s.wrap}>
            <div className={s.secHead}>
              <div>
                <span className={cx(s.eyebrow, s.onLight)}>
                  <span className={s.dot} />
                  Features
                </span>
                <h2 id="feat-title" data-reveal="">
                  Everything between the invoice and the payment
                </h2>
              </div>
              <p className={s.lede} data-reveal="">
                Rates, matching and the full picture of what clients owe you, in one place.
              </p>
            </div>

            <div className={s.bento}>
              <article className={cx(s.bc, s.wide, (arrive === "start" || arrive === "play") && s.unmatched, arrive === "start" && s.beatStart)} data-reveal="" data-beat="arrive">
                <div className={s.viz}>
                  <ul className={s.notes} aria-label="Recent payment notifications">
                    <li className={s.newWrap}>
                      <div>
                        <div className={s.note}>
                          <span className={s.av} style={{ background: "oklch(0.93 0.035 250)" }} aria-hidden="true">
                            NL
                          </span>
                          <div>
                            <b>Northgate Labs paid 1,333.34 USDT</b>
                            <small>TRC20 · matched to INV-1042</small>
                          </div>
                          <span className={s.swap}>
                            <span className={cx(s.badge, s.bWaiting, s.before)}>Verifying</span>
                            <span className={cx(s.badge, s.bPaid, s.after)}>Matched</span>
                          </span>
                        </div>
                      </div>
                    </li>
                    <li className={cx(s.note, s.old)}>
                      <span className={s.av} style={{ background: "oklch(0.94 0.045 85)" }} aria-hidden="true">
                        KC
                      </span>
                      <div>
                        <b>Kente Commerce paid 1,200.00 USDC</b>
                        <small>Base · part payment on INV-1039</small>
                      </div>
                      <span className={cx(s.badge, s.bPartial)}>Partly paid</span>
                    </li>
                    <li className={cx(s.note, s.old2)}>
                      <span className={s.av} style={{ background: "var(--mint)" }} aria-hidden="true">
                        MP
                      </span>
                      <div>
                        <b>Maple &amp; Pine Co. paid 4,500.00 USDC</b>
                        <small>Base · matched to INV-1036</small>
                      </div>
                      <span className={cx(s.badge, s.bPaid)}>Matched</span>
                    </li>
                  </ul>
                </div>
                <div className={s.bcTxt}>
                  <h3>Payments arrive on their own</h3>
                  <p>When a deposit lands, TakeFlow checks it with Roqqu and matches it to the right invoice. The invoice updates by itself.</p>
                </div>
              </article>

              <article className={cx(s.bc, s.wide)} data-reveal="" style={{ ["--rd" as string]: ".08s" }}>
                <div className={s.viz}>
                  <div className={s.quote}>
                    <div className={cx(s.row1, s.num)}>
                      <span>INV-1042 · Northgate Labs</span>
                      <span>£1,000.00</span>
                    </div>
                    <div className={s.send}>
                      <div>
                        <div className={s.lbl}>Send on TRC20</div>
                        <div className={cx(s.amt, s.num)}>
                          1,333.34 <small>USDT</small>
                        </div>
                      </div>
                      <div className={s.ring} role="img" aria-label={`Time left on this rate: ${hold}`}>
                        <svg viewBox="0 0 64 64" aria-hidden="true">
                          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--border)" strokeWidth="5" />
                          <circle cx="32" cy="32" r="28" fill="none" stroke="var(--teal-ink)" strokeWidth="5" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={(ring * (1 - left / 300)).toFixed(2)} />
                        </svg>
                        <span className={s.t}>{hold}</span>
                      </div>
                    </div>
                    <div className={cx(s.rchips, s.num)}>
                      <span className={cx(s.rchip, s.rchipLead)}>1 USDT</span>
                      <span className={s.rchip}>£0.75</span>
                      <span className={s.rchip}>₦1,375</span>
                      <span className={s.rchip}>€0.92</span>
                      <span className={s.rchip}>GH₵12.30</span>
                    </div>
                  </div>
                </div>
                <div className={s.bcTxt}>
                  <h3>A live rate, held for 5 minutes</h3>
                  <p>Clients see the exact crypto amount at Roqqu&apos;s rate, with a countdown before the quote refreshes.</p>
                </div>
              </article>

              <article className={cx(s.bc, money && s.playing)} data-reveal="" data-beat="money">
                <div className={s.viz}>
                  <div className={s.money}>
                    <div className={s.cap}>From invoiced to paid · last 30 days</div>
                    <div className={s.tot}>
                      <b className={s.num}>${paid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>paid of <span className={s.num}>$52,480.00</span>
                    </div>
                    <div className={s.mbar} aria-hidden="true">
                      <i style={{ width: "75.68%", background: "var(--teal-ink)" }} />
                      <i style={{ width: "5.45%", background: "var(--d-partial)" }} />
                      <i style={{ width: "9.91%", background: "var(--d-owed)" }} />
                      <i style={{ width: "8.96%", background: "var(--d-overdue)" }} />
                    </div>
                    <ul className={cx(s.mleg, s.num)}>
                      <li>
                        <span>
                          <i style={{ background: "var(--teal-ink)" }} />
                          Paid
                        </span>
                        <b>$39,719.21</b>
                      </li>
                      <li>
                        <span>
                          <i style={{ background: "var(--d-partial)" }} />
                          Partly paid
                        </span>
                        <b>$2,860.00</b>
                      </li>
                      <li>
                        <span>
                          <i style={{ background: "var(--d-owed)" }} />
                          Waiting
                        </span>
                        <b>$5,200.79</b>
                      </li>
                      <li>
                        <span>
                          <i style={{ background: "var(--d-overdue)" }} />
                          Overdue
                        </span>
                        <b>$4,700.00</b>
                      </li>
                    </ul>
                  </div>
                </div>
                <div className={s.bcTxt}>
                  <h3>From invoiced to paid</h3>
                  <p>See what&apos;s paid, part paid, waiting and overdue, totalled in the currency you choose.</p>
                </div>
              </article>

              <article className={s.bc} data-reveal="" style={{ ["--rd" as string]: ".08s" }}>
                <div className={s.viz}>
                  <ul className={cx(s.clients, s.num)}>
                    {[
                      ["GBP", "London", "£1,000.00", "1,333.34 USDT · TRC20"],
                      ["USD", "Toronto", "$4,500.00", "4,500.00 USDC · Base"],
                      ["EUR", "Nairobi", "€3,000.00", "3,260.87 USDT · TRC20"],
                      ["GHS", "Accra", "GH₵14,760.00", "1,200.00 USDC · Base"],
                      ["NGN", "Lagos", "₦2,200,000.00", "1,600.00 USDT · BEP20"],
                    ].map(([ccy, city, bill, paidWith]) => (
                      <li key={ccy}>
                        <span className={s.city}>
                          <span className={s.ccy}>{ccy}</span>
                          {city}
                        </span>
                        <span className={s.bill}>{bill}</span>
                        <span className={s.clientPaid}>Paid {paidWith}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={s.bcTxt}>
                  <h3>Each client, their own currency</h3>
                  <p>Invoice in NGN, USD, GBP, EUR or GHS. Clients send the matching amount in USDT or USDC.</p>
                </div>
              </article>

              <article className={cx(s.bc, s.last)} data-reveal="" style={{ ["--rd" as string]: ".16s" }}>
                <div className={s.viz}>
                  <div className={s.share}>
                    <div className={s.bubble}>
                      <div className={s.bubbleLink}>
                        <div className={s.t}>Website starter kit</div>
                        <div className={cx(s.p, s.num)}>₦343,750.00</div>
                        <div className={s.u}>/pay/links/link_a29a2ec1…</div>
                      </div>
                      <div className={s.msg}>Pay with USDT or USDC at this link</div>
                      <div className={s.meta}>16:40</div>
                    </div>
                    <div className={s.sharebar} aria-hidden="true">
                      <span className={s.on}>
                        <Icon name="chat" className={s.icon} />
                        WhatsApp
                      </span>
                      <span>
                        <Icon name="camera" className={s.icon} />
                        Instagram
                      </span>
                      <span>
                        <Icon name="link" className={s.icon} />
                        Copy
                      </span>
                    </div>
                  </div>
                </div>
                <div className={s.bcTxt}>
                  <h3>Links for your shop</h3>
                  <p>One-order checkout links, or a reusable product link to share on WhatsApp or Instagram.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* ============================ DARK BAND ============================ */}
        <section className={cx(s.bandDark, s.sec, s.dark)} aria-labelledby="band-title">
          <div className={s.wrap}>
            <div className={s.secHead}>
              <div>
                <span className={cx(s.eyebrow, s.onDark)}>
                  <span className={s.dot} />
                  What TakeFlow handles
                </span>
                <h2 id="band-title" data-reveal="">
                  Built for the money coming in
                </h2>
              </div>
              <p className={s.lede} data-reveal="">
                From the moment a client opens the payment page to the moment the invoice shows paid, every step is recorded.
              </p>
            </div>
            <div className={s.feat}>
              <Feature title="Verified with Roqqu" text="An invoice is marked paid only after Roqqu confirms the deposit, never on a notification alone." glyph="shield" />
              <Feature title="Automatic matching" text="Each invoice gets its own payment address, so every deposit lands on the right invoice. No spreadsheet." glyph="match" delay=".06s" />
              <Feature title="Part payments" text="A part payment is recorded on the invoice, and the rest stays owed until it's paid." glyph="part" delay=".12s" />
              <Feature title="Review queue" text="Payments with no invoice and overpayments wait in one list for you to check." glyph="queue" />
              <Feature title="Checkout links" text="One-order links for a single sale, or reusable product links for WhatsApp and Instagram." glyph="links" delay=".06s" />
              <Feature title="API for websites" text="Create checkouts from your own site with an API key, and track them like any invoice." glyph="api" delay=".12s" />
            </div>
          </div>
        </section>

        {/* ============================ HOW IT WORKS ============================ */}
        <section className={s.sec} id="how" aria-labelledby="how-title">
          <div className={s.wrap}>
            <div className={cx(s.secHead, s.center)}>
              <span className={cx(s.eyebrow, s.onLight)}>
                <span className={s.dot} />
                How it works
              </span>
              <h2 id="how-title" data-reveal="">
                From invoice to paid in three steps
              </h2>
            </div>
            <div className={s.steps}>
              <article className={s.step} data-reveal="">
                <div className={s.stage2}>
                  <div className={s.mini} aria-hidden="true">
                    <div className={s.miniH}>
                      New invoice <span className={cx(s.badge, s.bWaiting)}>Draft</span>
                    </div>
                    <div className={s.mfield}>
                      <span>Client</span>
                      <div className={s.in}>Northgate Labs</div>
                    </div>
                    <div className={s.mfield}>
                      <span>Currency</span>
                      <div className={s.ccyPick}>
                        <span>NGN</span>
                        <span>USD</span>
                        <span className={s.on}>GBP</span>
                        <span>EUR</span>
                        <span>GHS</span>
                      </div>
                    </div>
                    <div className={s.mfield}>
                      <span>Amount</span>
                      <div className={cx(s.in, s.num)}>
                        £1,000.00 <span style={{ fontSize: 12, color: "var(--ink-2)" }}>Due 20 Nov</span>
                      </div>
                    </div>
                    <div className={s.go}>Send invoice</div>
                  </div>
                </div>
                <h3>
                  <span className={s.no}>1</span>Create an invoice
                </h3>
                <p>Set the amount in NGN, USD, GBP, EUR or GHS and send the payment link to your client.</p>
              </article>

              <article className={s.step} data-reveal="" style={{ ["--rd" as string]: ".1s" }}>
                <div className={s.stage2}>
                  <div className={s.phone} role="img" aria-label="The payment page on a phone: £1,000.00, send 1,333.34 USDT on TRC20, with a QR code and a countdown">
                    <div className={s.scr}>
                      <div className={s.notch} />
                      <div className={s.pwho}>Lumen Studio · INV-1042</div>
                      <div className={cx(s.fiat, s.num)}>£1,000.00</div>
                      <div className={s.sendl}>Send on TRC20</div>
                      <div className={cx(s.cr, s.num)}>1,333.34 USDT</div>
                      <div className={s.qr} aria-hidden="true">
                        <QRCodeSVG value="TQ8mR3vX7cJk2Pq9WfLz5hYbN4dE6sAv4Jk" size={106} level="M" marginSize={0} fgColor="#101D30" />
                      </div>
                      <div className={s.addr}>
                        TQ8m…v4Jk <Icon name="copy" className={s.icon} />
                      </div>
                      <div>
                        <span className={s.cd}>
                          <Icon name="clock" className={s.icon} />
                          <span>{hold}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <h3>
                  <span className={s.no}>2</span>Client pays
                </h3>
                <p>They scan the code and send USDT or USDC from any wallet. The amount is held for 5 minutes.</p>
              </article>

              <article className={cx(s.step, matched === "start" && s.unmatched)} data-reveal="" data-beat="matched" style={{ ["--rd" as string]: ".2s" }}>
                <div className={s.stage2}>
                  <div className={s.drow} aria-hidden="true">
                    <div className={cx(s.r, s.dim)}>
                      <div>
                        <b>INV-1041</b>
                        <small>Order #A-2291 · Lagos</small>
                      </div>
                      <span className={cx(s.badge, s.bPaid)}>Paid</span>
                    </div>
                    <div className={cx(s.r, s.hl)}>
                      <div>
                        <b>INV-1042</b>
                        <small>Northgate Labs · London</small>
                      </div>
                      <span className={s.swap}>
                        <span className={cx(s.badge, s.bWaiting, s.before)}>Waiting</span>
                        <span className={cx(s.badge, s.bPaid, s.after)}>Paid</span>
                      </span>
                      <div className={s.pb}>
                        <i />
                      </div>
                      <div className={cx(s.stline, s.num)}>1,333.34 USDT · TRC20 · verified with Roqqu</div>
                    </div>
                    <div className={cx(s.r, s.dim)}>
                      <div>
                        <b>INV-1039</b>
                        <small>Kente Commerce · Accra</small>
                      </div>
                      <span className={cx(s.badge, s.bPartial)}>Partly paid</span>
                    </div>
                  </div>
                </div>
                <h3>
                  <span className={s.no}>3</span>It&apos;s matched
                </h3>
                <p>TakeFlow verifies the deposit with Roqqu and marks the invoice paid. Nothing to reconcile by hand.</p>
              </article>
            </div>
          </div>
        </section>

        {/* ============================ DEVELOPERS ============================ */}
        <section className={s.sec} id="developers" aria-labelledby="dev-title" style={{ paddingTop: "var(--sp-4)" }}>
          <div className={cx(s.wrap, s.dev)}>
            <div>
              <span className={cx(s.eyebrow, s.onLight)}>
                <span className={s.dot} />
                Developers
              </span>
              <h2 id="dev-title" data-reveal="">
                Add checkout to your website
              </h2>
              <p className={s.lede} data-reveal="">
                Create a checkout from your server with an API key. Your customer pays on the TakeFlow payment page, and the payment is verified and matched like any invoice.
              </p>
              <ul className={s.checks} data-reveal="">
                {[
                  "API keys from your TakeFlow settings",
                  "Price in NGN, USD, GBP, EUR or GHS",
                  "Customers pay in USDT on TRC20 or BEP20, or USDC on Base",
                  "Sending the same orderId again returns the same checkout",
                ].map((t) => (
                  <li key={t}>
                    <i>
                      <Icon name="check" className={s.icon} />
                    </i>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className={cx(s.code, s.dark)} data-reveal="" style={{ ["--rd" as string]: ".1s" }}>
              <div className={s.codeBar}>
                <span className={s.dots} aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className={s.fn}>create-checkout.js · example</span>
                <button type="button" className={s.copy} onClick={copy} aria-label="Copy the code example">
                  <Icon name={copied ? "check" : "copy"} className={s.icon} />
                  <span aria-live="polite">{copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre>
                <code>
                  <span className={s.tkK}>const</span> res = <span className={s.tkK}>await</span> fetch(<span className={s.tkS}>{"`${process.env.TAKEFLOW_API_URL}/api/v1/checkouts`"}</span>, {"{"}
                  {"\n  "}method: <span className={s.tkS}>&quot;POST&quot;</span>,{"\n  "}headers: {"{"}
                  {"\n    "}
                  <span className={s.tkS}>&quot;X-Api-Key&quot;</span>: process.env.TAKEFLOW_API_KEY,
                  {"\n    "}
                  <span className={s.tkS}>&quot;Content-Type&quot;</span>: <span className={s.tkS}>&quot;application/json&quot;</span>,{"\n  "}
                  {"},"}
                  {"\n  "}body: JSON.stringify({"{"}
                  {[
                    ["amount", "343750.00"],
                    ["currency", "NGN"],
                    ["cryptoAsset", "USDT"],
                    ["network", "trc20"],
                    ["orderId", "A-2291"],
                    ["description", "Website starter kit"],
                    ["returnUrl", "https://yourshop.com/thanks"],
                  ].map(([k, v]) => (
                    <span key={k}>
                      {"\n    "}
                      <span className={s.tkP}>{k}</span>: <span className={s.tkS}>&quot;{v}&quot;</span>,
                    </span>
                  ))}
                  {"\n  }),\n});\n"}
                  <span className={s.tkK}>const</span> checkout = <span className={s.tkK}>await</span> res.json();{"\n"}
                  <span className={s.tkC}>{"// Send your customer to /pay/<checkout.paymentReference>"}</span>
                </code>
              </pre>
              <div className={cx(s.resp, s.num)}>
                <b>201</b> · paymentReference: pay_7f3a… · 250.00 USDT at ₦1,375
              </div>
            </div>
          </div>
        </section>

        {/* ============================ CTA ============================ */}
        <section className={s.cta} aria-labelledby="cta-title">
          <div className={s.wrap}>
            <div className={cx(s.ctaPanel, s.dark)} data-reveal="">
              <span className={cx(s.eyebrow, s.onDark)}>
                <span className={s.dot} />
                Built on Roqqu API Services
              </span>
              <h2 id="cta-title">
                Every payment.
                <br />
                Accounted for.
              </h2>
              <p>Send your first invoice in your own currency and let TakeFlow match what comes in.</p>
              <div className={s.ctaRow} style={{ marginTop: "var(--sp-4)" }}>
                <Link href="/sign-up" className={cx(s.btn, s.btnPrimary)}>
                  Get started
                </Link>
                <a href="#how" className={cx(s.btn, s.btnRound)} aria-label="See how it works">
                  <Icon name="up" className={s.icon} />
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <div className={s.wrap}>
          <div className={s.footTop}>
            <div>
              <Logo width={148} />
              <p className={s.tag}>Every payment. Accounted for.</p>
              <p className={s.small}>Invoices and checkout links in your currency, paid in stablecoins. Payments run on Roqqu API Services.</p>
            </div>
            <div>
              <h3>Product</h3>
              <ul>
                <li>
                  <a href="#how">How it works</a>
                </li>
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#security">Security</a>
                </li>
              </ul>
            </div>
            <div>
              <h3>Developers</h3>
              <ul>
                <li>
                  <a href="#developers">API</a>
                </li>
                <li>
                  <Link href="/settings">API keys</Link>
                </li>
              </ul>
            </div>
            <div>
              <h3>Legal</h3>
              <ul>
                <li>
                  <Link href="/privacy">Privacy</Link>
                </li>
                <li>
                  <Link href="/terms">Terms</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className={s.footBot}>
            <span>© 2026 TakeFlow</span>
            <span>USDT on TRC20 and BEP20 · USDC on Base</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Feature({ title, text, glyph, delay }: { title: string; text: string; glyph: "shield" | "match" | "part" | "queue" | "links" | "api"; delay?: string }) {
  return (
    <article className={s.fc} data-reveal="" style={delay ? { ["--rd" as string]: delay } : undefined}>
      <h3>{title}</h3>
      <p>{text}</p>
      <div className={s.gl}>
        <Glyph kind={glyph} />
      </div>
    </article>
  );
}

function Glyph({ kind }: { kind: "shield" | "match" | "part" | "queue" | "links" | "api" }) {
  switch (kind) {
    case "shield":
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <path d="M46 12l28 11v20c0 18-12 32-28 38-16-6-28-20-28-38V23z" fill="url(#gDeep)" transform="translate(3 5)" />
          <path d="M46 12l28 11v20c0 18-12 32-28 38-16-6-28-20-28-38V23z" fill="url(#gTeal)" />
          <path d="M46 16l24 9.5v17.5c0 7-2 13-6 18" fill="none" stroke="url(#gShine)" strokeWidth="3" strokeLinecap="round" />
          <path d="M34 46l8 8 16-17" fill="none" stroke="#101D30" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "match":
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <rect x="12" y="20" width="36" height="46" rx="8" fill="url(#gDeep)" transform="translate(3 4)" />
          <rect x="12" y="20" width="36" height="46" rx="8" fill="url(#gTeal)" />
          <path d="M20 32h20M20 40h14" stroke="#101D30" strokeWidth="4" strokeLinecap="round" />
          <circle cx="62" cy="52" r="20" fill="url(#gDeep)" transform="translate(3 4)" />
          <circle cx="62" cy="52" r="20" fill="url(#gTeal)" />
          <path d="M53 52l6 6 12-12" fill="none" stroke="#101D30" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M48 30c8 0 14 4 14 12" fill="none" stroke="#C9F5E9" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
        </svg>
      );
    case "part":
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <circle cx="46" cy="46" r="32" fill="#0B6F5E" transform="translate(3 5)" />
          <circle cx="46" cy="46" r="32" fill="#C9F5E9" fillOpacity=".9" />
          <path d="M46 46V14a32 32 0 0 1 27.7 48z" fill="url(#gTeal)" />
          <path d="M46 46V14a32 32 0 0 1 27.7 48z" fill="none" stroke="#13B89A" strokeWidth="2" />
          <circle cx="46" cy="46" r="10" fill="#101D30" />
          <path d="M24 30a28 28 0 0 1 14-12" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "queue":
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <rect x="22" y="14" width="48" height="12" rx="6" fill="#C9F5E9" fillOpacity=".55" />
          <rect x="18" y="28" width="56" height="12" rx="6" fill="#C9F5E9" fillOpacity=".8" />
          <path d="M12 46h18l5 9h22l5-9h18v22a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="url(#gDeep)" transform="translate(3 4)" />
          <path d="M12 46h18l5 9h22l5-9h18v22a8 8 0 0 1-8 8H20a8 8 0 0 1-8-8z" fill="url(#gTeal)" />
          <path d="M16 50h12" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
        </svg>
      );
    case "links":
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <g transform="rotate(-40 46 46)">
            <rect x="10" y="34" width="40" height="24" rx="12" fill="none" stroke="#0B6F5E" strokeWidth="10" transform="translate(3 4)" />
            <rect x="42" y="34" width="40" height="24" rx="12" fill="none" stroke="#0B6F5E" strokeWidth="10" transform="translate(3 4)" />
            <rect x="10" y="34" width="40" height="24" rx="12" fill="none" stroke="url(#gTeal)" strokeWidth="10" />
            <rect x="42" y="34" width="40" height="24" rx="12" fill="none" stroke="#C9F5E9" strokeWidth="10" />
            <path d="M18 36h16" stroke="#fff" strokeOpacity=".8" strokeWidth="3" strokeLinecap="round" />
          </g>
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 92 92" aria-hidden="true">
          <rect x="12" y="16" width="68" height="60" rx="14" fill="url(#gDeep)" transform="translate(3 5)" />
          <rect x="12" y="16" width="68" height="60" rx="14" fill="url(#gTeal)" />
          <path d="M20 22h40" stroke="#fff" strokeOpacity=".7" strokeWidth="3" strokeLinecap="round" />
          <path d="M36 38l-10 9 10 9M56 38l10 9-10 9M50 34l-8 26" fill="none" stroke="#101D30" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
  }
}

function NetMark({ kind }: { kind: "tron" | "bnb" | "base" }) {
  if (kind === "tron") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="oklch(0.55 0.2 27)" />
        <path fill="none" stroke="#fff" strokeWidth="1.3" strokeLinejoin="round" d="M4.6 5.2l10.6 2.4-5.4 7.6zM4.6 5.2l5.2 10M15.2 7.6l-5 1.2-5.6-3.6" />
      </svg>
    );
  }
  if (kind === "bnb") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="oklch(0.82 0.15 85)" />
        <g fill="#101D30">
          <path d="M10 4.6l1.9 1.9L10 8.4 8.1 6.5zM10 11.6l1.9 1.9L10 15.4l-1.9-1.9zM6.5 8.1L8.4 10l-1.9 1.9L4.6 10zM13.5 8.1l1.9 1.9-1.9 1.9-1.9-1.9zM10 8.6l1.4 1.4L10 11.4 8.6 10z" />
        </g>
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="oklch(0.52 0.2 262)" />
      <path fill="#fff" d="M10 15.6a5.6 5.6 0 1 0-5.57-6.2h7.4v1.2h-7.4A5.6 5.6 0 0 0 10 15.6z" />
    </svg>
  );
}
