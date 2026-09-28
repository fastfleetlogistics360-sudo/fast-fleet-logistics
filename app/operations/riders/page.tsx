import { redirect } from "next/navigation";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { RiderFleetOperations } from "@/components/operations/rider-fleet-operations";

export const dynamic = "force-dynamic";
export default async function RiderFleetOperationsPage() { if (!(await requireAdminSession())) redirect("/"); return <RiderFleetOperations />; }
