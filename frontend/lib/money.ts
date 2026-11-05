// Money helpers. Amounts arrive from the API as decimal strings and are
// formatted with exact integer (BigInt) arithmetic, never JavaScript floats.
// toNumber() exists only for chart geometry (bar widths, line heights).

import type { Currency } from "./types";

const SCALE = 18;
const ONE = BigInt("1000000000000000000");
const TEN = BigInt(10);
const ZERO = BigInt(0);
const TWO = BigInt(2);
const pow10 = (n: number) => TEN ** BigInt(n);

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  NGN: "₦",
  GHS: "GH₵",
};

export const CURRENCY_NAME: Record<Currency, string> = {
  NGN: "Nigerian naira",
  USD: "US dollar",
  GBP: "British pound",
  EUR: "Euro",
  GHS: "Ghanaian cedi",
};

type DecInput = string | number | bigint | null | undefined;

// Parses a decimal string (also "1e-8" style, as Decimal.js can print) into
// a BigInt scaled by 10^18. Anything unreadable is zero.
export function parseDec(input: DecInput): bigint {
  if (typeof input === "bigint") return input;
  if (input === null || input === undefined || input === "") return ZERO;
  let s = String(input).trim();
  let neg = false;
  if (s.startsWith("-")) {
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  let exp = 0;
  const e = s.search(/e/i);
  if (e >= 0) {
    exp = parseInt(s.slice(e + 1), 10) || 0;
    s = s.slice(0, e);
  }
  const [rawInt, rawFrac = ""] = s.split(".");
  let digits = (rawInt || "0") + rawFrac;
  let point = (rawInt || "0").length + exp;
  if (point < 0) {
    digits = "0".repeat(-point) + digits;
    point = 0;
  }
  if (point > digits.length) digits += "0".repeat(point - digits.length);
  const intPart = digits.slice(0, point) || "0";
  const fracPart = digits.slice(point);
  if (!/^\d+$/.test(intPart) || (fracPart !== "" && !/^\d+$/.test(fracPart))) return ZERO;
  const frac = (fracPart + "0".repeat(SCALE)).slice(0, SCALE);
  const v = BigInt(intPart) * ONE + BigInt(frac);
  return neg ? -v : v;
}

// Rounds a 10^18-scaled value to `dp` places; returns it scaled by 10^dp.
function roundTo(v: bigint, dp: number, mode: "half-up" | "up" = "half-up"): bigint {
  const factor = pow10(SCALE - dp);
  const neg = v < ZERO;
  const a = neg ? -v : v;
  let q = a / factor;
  const r = a % factor;
  if (mode === "half-up" && r * TWO >= factor) q += BigInt(1);
  if (mode === "up" && r > ZERO) q += BigInt(1);
  return neg ? -q : q;
}

function groupThousands(int: string): string {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// "1234567.891" -> "1,234,567.89"
export function formatDecimal(value: DecInput, dp = 2, opts: { group?: boolean; mode?: "half-up" | "up" } = {}): string {
  const { group = true, mode = "half-up" } = opts;
  const q = roundTo(parseDec(value), dp, mode);
  const neg = q < ZERO;
  const a = neg ? -q : q;
  const s = a.toString().padStart(dp + 1, "0");
  const int = dp > 0 ? s.slice(0, -dp) : s;
  const frac = dp > 0 ? s.slice(-dp) : "";
  const body = (group ? groupThousands(int) : int) + (dp > 0 ? "." + frac : "");
  return (neg ? "−" : "") + body;
}

// Plain decimal string with full precision trimmed, for sending to the API.
export function decToString(v: bigint, dp = SCALE): string {
  const q = roundTo(v, dp);
  const neg = q < ZERO;
  const a = neg ? -q : q;
  const s = a.toString().padStart(dp + 1, "0");
  let int = dp > 0 ? s.slice(0, -dp) : s;
  let frac = dp > 0 ? s.slice(-dp) : "";
  frac = frac.replace(/0+$/, "");
  int = int.replace(/^0+(?=\d)/, "");
  return (neg ? "-" : "") + int + (frac ? "." + frac : "");
}

export function symbolFor(currency: string): string {
  return CURRENCY_SYMBOL[currency as Currency] ?? "";
}

// "£1,000.00". Unknown currencies get the code as a suffix.
export function formatMoney(value: DecInput, currency: string, dp = 2): string {
  const sym = CURRENCY_SYMBOL[currency as Currency];
  const body = formatDecimal(value, dp);
  if (!sym) return `${body} ${currency}`;
  if (body.startsWith("−")) return "−" + sym + body.slice(1);
  return sym + body;
}

// Crypto amounts: two decimal places for the accepted stablecoins.
export function formatCrypto(value: DecInput, asset: string, dp = 2): string {
  return `${formatDecimal(value, dp)} ${asset}`;
}

export function addDec(...values: DecInput[]): string {
  return decToString(values.reduce<bigint>((sum, v) => sum + parseDec(v), ZERO));
}

export function subDec(a: DecInput, b: DecInput): string {
  return decToString(parseDec(a) - parseDec(b));
}

export function mulDec(a: DecInput, b: DecInput): string {
  return decToString((parseDec(a) * parseDec(b)) / ONE);
}

export function divDec(a: DecInput, b: DecInput): string {
  const d = parseDec(b);
  if (d === ZERO) return "0";
  return decToString((parseDec(a) * ONE) / d);
}

export function cmpDec(a: DecInput, b: DecInput): number {
  const x = parseDec(a);
  const y = parseDec(b);
  return x === y ? 0 : x > y ? 1 : -1;
}

export function isZero(a: DecInput): boolean {
  return parseDec(a) === ZERO;
}

export function maxDec(a: DecInput, b: DecInput): string {
  return cmpDec(a, b) >= 0 ? decToString(parseDec(a)) : decToString(parseDec(b));
}

// Rounds up to `dp` places, as quotes do, so a payer never sends too little.
export function ceilDec(a: DecInput, dp = 2): string {
  return decToString(roundTo(parseDec(a), dp, "up") * pow10(SCALE - dp));
}

export function roundDec(a: DecInput, dp = 2): string {
  return decToString(roundTo(parseDec(a), dp) * pow10(SCALE - dp));
}

// Whole-number percentage of part in whole, e.g. "76".
export function percentOf(part: DecInput, whole: DecInput, dp = 0): string {
  const w = parseDec(whole);
  if (w === ZERO) return "0";
  const ratio = (parseDec(part) * ONE * BigInt(100)) / w;
  return formatDecimal(ratio, dp, { group: false });
}

// Converts with a rates table given as units per 1 USD. Used only for the
// payer's "for reference" display, never for what anyone owes.
export function convertDec(amount: DecInput, from: string, to: string, perUsd: Record<string, string>): string | null {
  if (from === to) return decToString(parseDec(amount));
  const rf = perUsd[from];
  const rt = perUsd[to];
  if (!rf || !rt || isZero(rf)) return null;
  const usd = (parseDec(amount) * ONE) / parseDec(rf);
  return decToString((usd * parseDec(rt)) / ONE);
}

// For chart geometry only.
export function toNumber(value: DecInput): number {
  const v = parseDec(value);
  return Number(v / pow10(12)) / 1e6;
}

// Short axis labels for charts: "$12.5k", "₦1.2M".
export function compactMoney(n: number, currency: string): string {
  const sym = symbolFor(currency) || "";
  const a = Math.abs(n);
  if (a >= 1e9) return sym + +(n / 1e9).toFixed(1) + "B";
  if (a >= 1e6) return sym + +(n / 1e6).toFixed(1) + "M";
  if (a >= 1e3) return sym + +(n / 1e3).toFixed(1) + "k";
  return sym + Math.round(n);
}
