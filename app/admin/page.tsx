import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminPanel } from "@/components/admin/admin-panel";
import { requireAdminSession } from "@/app/api/admin/_auth";

export const metadata: Metadata = {
  title: "Admin Panel"
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return (await requireAdminSession()) ? <AdminPanel /> : <AdminLogin />;
}
