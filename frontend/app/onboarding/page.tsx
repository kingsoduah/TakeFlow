import type { Metadata } from "next";
import { OnboardingView } from "@/components/views/AuthViews";

export const metadata: Metadata = { title: "Set up your business" };

export default function OnboardingPage() {
  return <OnboardingView />;
}
