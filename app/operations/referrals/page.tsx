import { redirect } from "next/navigation";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { ReferralOperations } from "@/components/operations/referral-operations";

export const dynamic = "force-dynamic";
export default async function ReferralOperationsPage() { if (!(await requireAdminSession())) redirect("/"); return <ReferralOperations />; }
