import type { Metadata } from "next";
import { NewInvoiceView } from "@/components/views/NewInvoiceView";

export const metadata: Metadata = { title: "New invoice" };

export default function NewInvoicePage() {
  return <NewInvoiceView />;
}
