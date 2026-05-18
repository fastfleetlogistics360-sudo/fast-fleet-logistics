import type { Metadata } from "next";
import { RiderDashboard } from "@/components/rider/rider-dashboard";

export const metadata: Metadata = {
  title: "Rider Dashboard"
};

export default function RiderDashboardPage() {
  return <RiderDashboard />;
}
