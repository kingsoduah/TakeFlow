import type { Metadata } from "next";
import { Suspense } from "react";
import { NewCheckoutLinkView } from "@/components/views/NewCheckoutLinkView";

export const metadata: Metadata = { title: "New checkout link" };

export default function NewCheckoutLinkPage() {
  return (
    <Suspense>
      <NewCheckoutLinkView />
    </Suspense>
  );
}
