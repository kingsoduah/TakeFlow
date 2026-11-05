"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Icon, type IconName } from "@/components/icons";
import { CurrencySeg, Skeleton } from "@/components/ui";
import { api, ApiError, errorMessage, USE_MOCKS, type NavCounts } from "@/lib/api";
import { AppContext, type AppState } from "@/lib/app-context";
import { initials } from "@/lib/format";
import { session } from "@/lib/session";
import type { Business, Currency, User } from "@/lib/types";

const NAV: { href: string; label: string; icon: IconName; count?: (n: NavCounts) => { value: number; label: string; alert?: boolean } | null }[] = [
  { href: "/dashboard", label: "Dashboard", icon: "grid" },
  { href: "/invoices", label: "Invoices", icon: "file", count: (n) => (n.openInvoices ? { value: n.openInvoices, label: `${n.openInvoices} open` } : null) },
  { href: "/checkout-links", label: "Checkout links", icon: "link", count: (n) => (n.activeLinks ? { value: n.activeLinks, label: `${n.activeLinks} active` } : null) },
  { href: "/transactions", label: "Transactions", icon: "swap", count: (n) => (n.unmatched ? { value: n.unmatched, label: `${n.unmatched} unmatched`, alert: true } : null) },
  { href: "/clients", label: "Clients", icon: "users" },
  { href: "/settings", label: "Settings", icon: "cog" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ctx, setCtx] = useState<{ user: User; business: Business } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [currency, setCurrencyState] = useState<Currency>("USD");
  const [nav, setNav] = useState<NavCounts | null>(null);
  const [navTick, setNavTick] = useState(0);
  const [open, setOpen] = useState(false);
  const [bootTick, setBootTick] = useState(0);
  const menuBtn = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  });

  // Who is signed in, and which business they are looking at.
  useEffect(() => {
    let alive = true;
    if (!session.getToken()) {
      router.replace(`/sign-in?next=${encodeURIComponent(pathRef.current)}`);
      return;
    }
    Promise.all([api.me(), api.listBusinesses()])
      .then(([user, businesses]) => {
        if (!alive) return;
        if (businesses.length === 0) {
          router.replace("/onboarding");
          return;
        }
        const saved = session.getBusinessId();
        const business = businesses.find((b) => b.id === saved) ?? businesses[0];
        session.setBusinessId(business.id);
        setCurrencyState(session.getDisplayCurrency() ?? user.displayCurrency ?? "USD");
        setFailed(null);
        setCtx({ user, business });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) {
          session.clear();
          router.replace(`/sign-in?next=${encodeURIComponent(pathRef.current)}`);
          return;
        }
        setFailed(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, [router, bootTick]);

  // Sidebar counts, refreshed on every page change and every 30 seconds.
  const businessId = ctx?.business.id;
  useEffect(() => {
    if (!businessId) return;
    let alive = true;
    const load = () =>
      api
        .getNavCounts(businessId)
        .then((n) => alive && setNav(n))
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [businessId, pathname, navTick]);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    session.setDisplayCurrency(c);
    api.setDisplayCurrency(c).catch(() => {
      // The choice still applies in this browser.
    });
  }, []);

  const refreshNav = useCallback(() => setNavTick((t) => t + 1), []);

  // Drawer: Escape closes it, focus moves in and back out.
  const drawer = useCallback((next: boolean) => {
    setOpen(next);
    setTimeout(() => {
      if (next) sidebar.current?.querySelector<HTMLElement>("a")?.focus();
      else menuBtn.current?.focus();
    }, 0);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") drawer(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, drawer]);

  const signOut = () => {
    session.clear();
    router.replace("/sign-in");
  };

  const value: AppState | null = useMemo(
    () => (ctx ? { user: ctx.user, business: ctx.business, currency, setCurrency, nav, refreshNav } : null),
    [ctx, currency, setCurrency, nav, refreshNav],
  );

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const onDashboard = pathname === "/dashboard";

  return (
    <>
      <aside className={`sidebar${open ? " open" : ""}`} id="sidebar" aria-label="Main navigation" ref={sidebar}>
        <Link href="/dashboard" className="sb-logo" onClick={() => setOpen(false)}>
          <Logo onNavy priority />
        </Link>
        <div className="sb-section">Workspace</div>
        <nav>
          <ul className="nav">
            {NAV.map((item) => {
              const c = nav && item.count ? item.count(nav) : null;
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive(item.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} />
                    {item.label}
                    {c ? (
                      <span className={`count num${c.alert ? " alert" : ""}`} aria-label={c.label}>
                        {c.value}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="sb-foot">
          {USE_MOCKS ? (
            <p className="sample-note">
              <b>Sample data.</b> Nothing here is a real payment.
            </p>
          ) : null}
          <p className="tagline">
            Every payment. <b>Accounted for.</b>
          </p>
          <div className="user">
            {ctx ? (
              <>
                <span className="av" aria-hidden="true">
                  {initials(ctx.user.fullName)}
                </span>
                <div className="min-w-0">
                  <div className="user-name truncate">{ctx.user.fullName}</div>
                  <div className="user-role">Owner · {ctx.business.businessName}</div>
                </div>
              </>
            ) : (
              <span className="user-role">Loading…</span>
            )}
          </div>
          <button type="button" className="sb-signout" onClick={signOut}>
            <Icon name="logout" className="icon icon-sm" />
            Sign out
          </button>
        </div>
      </aside>
      {open ? <div className="scrim" onClick={() => drawer(false)} aria-hidden="true" /> : null}

      <div className="main">
        <div className="mobile-bar">
          <Link href="/dashboard" aria-label="TakeFlow dashboard">
            <Logo onNavy width={116} />
          </Link>
          <button
            ref={menuBtn}
            type="button"
            className="menu-btn"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-controls="sidebar"
            aria-expanded={open}
            onClick={() => drawer(!open)}
          >
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>

        <header className="topbar">
          {ctx ? (
            <div className="biz">
              <div className="biz-mark" aria-hidden="true">
                {initials(ctx.business.businessName)}
              </div>
              <div className="min-w-0">
                <div className="biz-name truncate">{ctx.business.businessName}</div>
                {ctx.business.businessType ? <div className="biz-sub truncate">{ctx.business.businessType}</div> : null}
              </div>
            </div>
          ) : (
            <div className="biz">
              <Skeleton h={40} w={40} />
              <Skeleton h={16} w={140} />
            </div>
          )}
          <div className="top-actions">
            {onDashboard && ctx ? <CurrencySeg name="topbar-currency" value={currency} onChange={setCurrency} /> : null}
            <Link href="/checkout-links/new" className="btn btn-secondary">
              <Icon name="link" className="icon icon-sm" />
              New checkout link
            </Link>
            <Link href="/invoices/new" className="btn btn-primary">
              <Icon name="plus" className="icon icon-sm" style={{ strokeWidth: 2.2 }} />
              New invoice
            </Link>
          </div>
        </header>

        <main className="content" id="content">
          {failed ? (
            <div className="card">
              <div className="empty" role="alert">
                <h3>We couldn&apos;t load your workspace</h3>
                <p>{failed}</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBootTick((t) => t + 1)}>
                  <Icon name="refresh" className="icon icon-sm" />
                  Try again
                </button>
              </div>
            </div>
          ) : value ? (
            <AppContext.Provider value={value}>{children}</AppContext.Provider>
          ) : (
            <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading">
              <Skeleton h={32} w={220} />
              <Skeleton h={240} />
              <div className="kpis">
                <Skeleton h={150} />
                <Skeleton h={150} />
                <Skeleton h={150} />
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
