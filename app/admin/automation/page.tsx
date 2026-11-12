import type { Metadata } from "next";
import { AdminLogin } from "@/components/admin/admin-login";
import { FastAiCommandCentre } from "@/components/admin/fast-ai-command-centre";
import { requireAdminSession } from "@/app/api/admin/_auth";

export const metadata: Metadata = { title: "FAST AI Command Centre | Fast Fleets 360" };
export const dynamic = "force-dynamic";

export default async function AutomationPage() { return (await requireAdminSession()) ? <FastAiCommandCentre /> : <AdminLogin />; }
