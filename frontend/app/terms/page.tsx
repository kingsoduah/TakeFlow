import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>This page is a placeholder while TakeFlow is in its hackathon build. The full terms of use will be published here before launch.</p>
      <p>
        TakeFlow helps businesses invoice in NGN, USD, GBP, EUR or GHS and receive USDT or USDC. Crypto amounts are worked out from Roqqu&apos;s rates and held for a short
        time on the payment page. Payments sent on the wrong network can&apos;t be recovered.
      </p>
    </LegalPage>
  );
}
