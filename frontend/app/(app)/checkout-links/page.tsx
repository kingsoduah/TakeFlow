import type { Metadata } from "next";
import { CheckoutLinksView } from "@/components/views/CheckoutLinksView";

export const metadata: Metadata = { title: "Checkout links" };

export default function CheckoutLinksPage() {
  return <CheckoutLinksView />;
}
