import type { Metadata } from "next";
import { SignUpView } from "@/components/views/AuthViews";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return <SignUpView />;
}
