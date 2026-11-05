import type { Metadata } from "next";
import { Suspense } from "react";
import { InvoiceDetailView } from "@/components/views/InvoiceDetailView";

export const metadata: Metadata = { title: "Invoice" };

export default function InvoiceDetailPage() {
  return (
    <Suspense>
      <InvoiceDetailView />
    </Suspense>
  );
}
