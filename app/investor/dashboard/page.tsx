import type { Metadata } from "next";
import { InvestorDashboard } from "@/components/investor/investor-dashboard";

export const metadata: Metadata = { title: "Investor Dashboard" };

export default function InvestorDashboardPage() {
  return <InvestorDashboard />;
}
