import type { Metadata } from "next";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { FastErrandsAdminQueue } from "@/components/admin/fast-errands-admin-queue";

export const metadata: Metadata = { title: "FastErrands Queue | Admin" };
export const dynamic = "force-dynamic";
export default async function AdminFastErrandsPage() { return (await requireAdminSession()) ? <FastErrandsAdminQueue /> : <AdminLogin />; }
