import { redirect } from "next/navigation";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { CyclistApplicationOperations } from "@/components/operations/cyclist-application-operations";

export const dynamic = "force-dynamic";
export default async function CyclistApplicationsPage() { if (!(await requireAdminSession())) redirect("/"); return <CyclistApplicationOperations />; }
