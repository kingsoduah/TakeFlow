// Browser-side session: the JWT, the chosen business and the personal
// display currency. Everything here is per browser.

import { CURRENCIES, type Currency } from "./types";

const TOKEN_KEY = "takeflow.token";
const BUSINESS_KEY = "takeflow.businessId";
const CURRENCY_KEY = "takeflow.displayCurrency";

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Private mode or storage blocked: the session lasts for this page only.
  }
}

export const session = {
  getToken: () => read(TOKEN_KEY),
  setToken: (token: string) => write(TOKEN_KEY, token),
  getBusinessId: () => read(BUSINESS_KEY),
  setBusinessId: (id: string | null) => write(BUSINESS_KEY, id),
  getDisplayCurrency(): Currency | null {
    const v = read(CURRENCY_KEY);
    return v && (CURRENCIES as readonly string[]).includes(v) ? (v as Currency) : null;
  },
  setDisplayCurrency: (c: Currency) => write(CURRENCY_KEY, c),
  clear() {
    write(TOKEN_KEY, null);
    write(BUSINESS_KEY, null);
  },
};
