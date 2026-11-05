import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInView } from "@/components/views/AuthViews";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense>
      <SignInView />
    </Suspense>
  );
}
