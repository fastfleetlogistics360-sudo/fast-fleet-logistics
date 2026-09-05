import type { Metadata } from "next";
import { InvestorOnboarding } from "@/components/investor/investor-onboarding";

export const metadata: Metadata = { title: "Activate Investor Account" };

export default function InvestorActivationPage() {
  return <InvestorOnboarding />;
}
