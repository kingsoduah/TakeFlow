import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoicesView } from "@/components/views/InvoicesView";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return (
    <Suspense>
      <InvoicesView />
    </Suspense>
  );
}
