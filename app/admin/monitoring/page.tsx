import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { LiveMonitoringWallboard } from "@/components/admin/live-monitoring-wallboard";
import { requireAdminSession } from "@/app/api/admin/_auth";

export const metadata: Metadata = {
  title: "Live Monitoring | Fast Fleets 360"
};

export const dynamic = "force-dynamic";

export default async function MonitoringPage() {
  return (await requireAdminSession()) ? <LiveMonitoringWallboard /> : <AdminLogin />;
}
