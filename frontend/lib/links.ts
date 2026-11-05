// Public link helpers. NEXT_PUBLIC_APP_URL sets the address shared with
// payers; without it the current site address is used.

export function appOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  if (configured) return configured;
  return typeof window !== "undefined" ? window.location.origin : "";
}

// Invoices and one-order checkouts: /pay/<paymentReference>
export function payUrl(reference: string): string {
  return `${appOrigin()}/pay/${reference}`;
}

// Reusable product links: /pay/links/<reference>
export function productLinkUrl(reference: string): string {
  return `${appOrigin()}/pay/links/${reference}`;
}

export function withoutScheme(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
