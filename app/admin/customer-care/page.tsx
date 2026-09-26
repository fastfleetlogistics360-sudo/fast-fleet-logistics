import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { CustomerCareWorkspace } from "@/components/admin/customer-care-workspace";
import { requireAdminSession } from "@/app/api/admin/_auth";
export const metadata: Metadata = { title: "Customer Care" };
export const dynamic = "force-dynamic";
export default async function CustomerCarePage() { return (await requireAdminSession()) ? <CustomerCareWorkspace /> : <AdminLogin />; }
