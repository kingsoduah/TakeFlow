import type { Metadata } from "next";
import { LandingView } from "@/components/landing/LandingView";

export const metadata: Metadata = {
  title: { absolute: "TakeFlow · Every payment. Accounted for." },
  description: "Bill in your own currency, get paid in USDT or USDC, and see every payment matched to its invoice.",
  icons: { icon: "/brand/takeflow-symbol.png" },
};

export default function Home() {
  return <LandingView />;
}
