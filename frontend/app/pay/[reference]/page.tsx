import type { Metadata } from "next";
import { PaymentView, ProductLinkStep } from "@/components/views/PayView";

export const metadata: Metadata = {
  title: "Pay",
  robots: { index: false, follow: false },
};

export default async function PayPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  // Product links live at /pay/links/<reference>; a bare link_ reference still works.
  return reference.startsWith("link_") ? <ProductLinkStep reference={reference} /> : <PaymentView reference={reference} />;
}
