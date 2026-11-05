import type { Metadata } from "next";
import { ProductLinkStep } from "@/components/views/PayView";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false, follow: false },
};

export default async function ProductLinkPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  return <ProductLinkStep reference={reference} />;
}
