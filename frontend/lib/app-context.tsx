"use client";

import { createContext, useContext } from "react";
import type { NavCounts } from "./api";
import type { Business, Currency, User } from "./types";

export interface AppState {
  user: User;
  business: Business;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  nav: NavCounts | null;
  refreshNav: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside the app shell");
  return ctx;
}
