"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { STATUS_BADGE, STATUS_LABEL, networkShort } from "@/lib/format";
import type { Currency, InvoiceStatus, ReconciliationStatus } from "@/lib/types";
import { CURRENCIES } from "@/lib/types";
import { CoinGlyph, Icon, type IconName } from "./icons";

// ---------- Toast ----------

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((m: string) => {
    setMessage(m);
    setOn(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOn(false), 2600);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className={`toast${on ? " on" : ""}`} role="status" aria-live="polite">
        <Icon name="check" />
        <span>{message}</span>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---------- Copy ----------

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea fallback
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  text,
  label,
  done = "Copied",
  toastMessage,
  variant = "icon",
  className,
  children = "Copy link",
}: {
  text: string;
  label: string;
  done?: string;
  toastMessage?: string;
  variant?: "icon" | "button" | "small";
  className?: string;
  children?: ReactNode;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    const ok = await copyText(text);
    if (ok) {
      setCopied(true);
      toast(toastMessage ?? done);
      setTimeout(() => setCopied(false), 1800);
    } else {
      toast("Copy didn't work. Select the text and copy it yourself.");
    }
  };
  if (variant === "icon") {
    return (
      <button type="button" className={`icon-btn ${className ?? ""}`} aria-label={label} onClick={onClick}>
        <Icon name={copied ? "check" : "copy"} className="icon icon-sm" />
      </button>
    );
  }
  return (
    <button type="button" className={`btn ${variant === "small" ? "btn-secondary btn-sm" : "btn-secondary"} ${className ?? ""}`} onClick={onClick} aria-label={label}>
      <Icon name={copied ? "check" : "copy"} className="icon icon-sm" />
      {copied ? done : children}
    </button>
  );
}

// ---------- Badges ----------

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  return <span className={`badge ${STATUS_BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function TxBadge({ status }: { status: ReconciliationStatus }) {
  if (status === "MATCHED") return <span className="badge b-matched">Matched</span>;
  if (status === "UNMATCHED") return <span className="badge b-unmatched">Unmatched</span>;
  return <span className="badge b-checking">Checking</span>;
}

export function CoinNet({ asset, network }: { asset: string; network: string }) {
  return (
    <span className="coin">
      <CoinGlyph asset={asset} />
      {asset} <span className="net">{networkShort(network)}</span>
    </span>
  );
}

// ---------- Segmented currency control ----------

export function CurrencySeg({
  name,
  value,
  onChange,
  label = "Show in",
  legend = "Display currency",
  full = false,
  onCloud = false,
  options = CURRENCIES as readonly Currency[],
}: {
  name: string;
  value: Currency;
  onChange: (c: Currency) => void;
  label?: string | null;
  legend?: string;
  full?: boolean;
  onCloud?: boolean;
  options?: readonly Currency[];
}) {
  return (
    <fieldset className={`seg-wrap${full ? " w-full" : ""}${onCloud ? " on-cloud" : ""}`}>
      <legend className="sr-only">{legend}</legend>
      {label ? (
        <span className="lbl" aria-hidden="true">
          {label}
        </span>
      ) : null}
      <div className={`seg${full ? " seg-full" : ""}`}>
        {options.map((c) => (
          <label key={c}>
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} />
            <span>{c}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

// ---------- States ----------

export function Empty({ icon = "file", title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ic">
        <Icon name={icon} />
      </div>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <div className="ic" style={{ background: "var(--st-overdue-bg)", color: "var(--st-overdue-fg)" }}>
        <Icon name="alert" />
      </div>
      <h3>That didn&apos;t load</h3>
      <p>{message}</p>
      {onRetry ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          <Icon name="refresh" className="icon icon-sm" />
          Try again
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", className = "" }: { h?: number; w?: number | string; className?: string }) {
  return <div className={`skeleton ${className}`} style={{ height: h, width: w }} aria-hidden="true" />;
}

export function LoadingCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <div className="card-body flex flex-col gap-3 pt-6">
        <Skeleton h={18} w="40%" />
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} h={40} />
        ))}
      </div>
    </div>
  );
}
