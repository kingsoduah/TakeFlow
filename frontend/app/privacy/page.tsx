import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>This page is a placeholder while TakeFlow is in its hackathon build. The full privacy policy will be published here before launch.</p>
      <p>
        What we keep today: the details you give us to run your account (your name, email and business name), the invoices and checkout links you create, and the payments
        that reach your addresses. Buyers can pay without giving a name or email.
      </p>
      <p>Payments run on Roqqu API Services. We never ask for wallet keys, and TakeFlow never sends money out of your account.</p>
    </LegalPage>
  );
}
