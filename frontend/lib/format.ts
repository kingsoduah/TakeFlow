// Date and label helpers. Times show in the viewer's own time zone.

import type { InvoiceStatus, Network } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_MS = 86_400_000;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "24 Oct" this year, "24 Oct 2025" otherwise.
export function formatDate(iso: string | Date | null | undefined, opts: { year?: boolean } = {}): string {
  if (!iso) return "";
  const d = new Date(iso);
  const showYear = opts.year ?? d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${showYear ? " " + d.getFullYear() : ""}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

// "Today, 10:42", "Yesterday, 18:30", "4 Nov, 18:30"
export function formatDateTime(iso: string | Date | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY_MS);
  const time = formatTime(d);
  if (diff === 0) return `Today, ${time}`;
  if (diff === 1) return `Yesterday, ${time}`;
  return `${formatDate(d)}, ${time}`;
}

export function daysBetween(fromIso: string | Date, to: Date = new Date()): number {
  return Math.round((startOfDay(to) - startOfDay(new Date(fromIso))) / DAY_MS);
}

export function rangeLabel(fromIso: string, toIso: string): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  return `${formatDate(from, { year: from.getFullYear() !== to.getFullYear() })} to ${formatDate(to, { year: true })}`;
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  PENDING: "Waiting",
  PARTIALLY_PAID: "Partly paid",
  PAID: "Paid",
  OVERDUE: "Overdue",
  EXPIRED: "Expired",
};

export const STATUS_BADGE: Record<InvoiceStatus, string> = {
  DRAFT: "b-draft",
  PENDING: "b-waiting",
  PARTIALLY_PAID: "b-partial",
  PAID: "b-paid",
  OVERDUE: "b-overdue",
  EXPIRED: "b-draft",
};

export const NETWORK_SHORT: Record<string, string> = {
  trc20: "TRC20",
  bep20: "BEP20",
  base: "Base",
};

export const NETWORK_NAME: Record<string, string> = {
  trc20: "Tron (TRC20)",
  bep20: "BNB Smart Chain (BEP20)",
  base: "Base",
};

export function networkShort(n: Network | string): string {
  return NETWORK_SHORT[n] ?? n.toUpperCase();
}

export function networkName(n: Network | string): string {
  return NETWORK_NAME[n] ?? n.toUpperCase();
}

// Explorer links per network.
export function explorerFor(network: string): { name: string; tx: (hash: string) => string; address: (a: string) => string } | null {
  switch (network) {
    case "trc20":
      return {
        name: "Tronscan",
        tx: (h) => `https://tronscan.org/#/transaction/${h}`,
        address: (a) => `https://tronscan.org/#/address/${a}`,
      };
    case "bep20":
      return {
        name: "BscScan",
        tx: (h) => `https://bscscan.com/tx/${h}`,
        address: (a) => `https://bscscan.com/address/${a}`,
      };
    case "base":
      return {
        name: "Basescan",
        tx: (h) => `https://basescan.org/tx/${h}`,
        address: (a) => `https://basescan.org/address/${a}`,
      };
    default:
      return null;
  }
}

// "7f3a…e21e", "0x4c8e…a64d"
export function shortHash(hash: string, size = 4): string {
  if (!hash) return "";
  const has0x = hash.startsWith("0x");
  const body = has0x ? hash.slice(2) : hash;
  if (body.length <= size * 2 + 1) return hash;
  return `${has0x ? "0x" : ""}${body.slice(0, size)}…${body.slice(-size)}`;
}

export function shortAddress(address: string, size = 6): string {
  if (!address || address.length <= size * 2 + 1) return address;
  return `${address.slice(0, size)}…${address.slice(-size)}`;
}

export function initials(name: string): string {
  const parts = name
    .replace(/[^\p{L}\p{N}\s&]/gu, " ")
    .split(/\s+/)
    .filter((p) => p && p !== "&");
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Stable avatar tint (t1 to t5) from a name.
export function tintFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `t${(h % 5) + 1}`;
}

export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : many ?? one + "s"}`;
}
