import type { Metadata } from "next";
import { BusinessDashboard } from "@/components/dashboard/business-dashboard";

export const metadata: Metadata = {
  title: "Business Dashboard"
};

export default function BusinessDashboardPage() {
  return <BusinessDashboard />;
}
