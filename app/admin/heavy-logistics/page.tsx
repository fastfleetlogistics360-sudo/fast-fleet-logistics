import type { Metadata } from "next";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { HeavyLogisticsQueue } from "@/components/admin/heavy-logistics-queue";

export const metadata: Metadata = { title: "Heavy Logistics Queue" };
export const dynamic = "force-dynamic";

export default async function HeavyLogisticsAdminPage() {
  return (await requireAdminSession()) ? <HeavyLogisticsQueue /> : <AdminLogin />;
}
