import { redirect } from "next/navigation";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { OperationsTeam } from "@/components/operations/operations-team";
export const dynamic = "force-dynamic";
export default async function OperationsTeamPage() { if (!(await requireAdminSession())) redirect("/"); return <OperationsTeam />; }
