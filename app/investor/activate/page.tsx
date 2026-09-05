import type { Metadata } from "next";
import { Suspense } from "react";
import { InvestorOnboarding } from "@/components/investor/investor-onboarding";

export const metadata: Metadata = { title: "Activate Investor Account" };

export default function InvestorActivationPage() {
  return <Suspense><InvestorOnboarding /></Suspense>;
}
