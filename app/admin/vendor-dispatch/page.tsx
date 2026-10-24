import { redirect } from "next/navigation";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { VendorDispatchAdmin } from "@/components/admin/vendor-dispatch-admin";
export default async function AdminVendorDispatchPage() { if (!(await requireAdminSession())) redirect("/admin"); return <VendorDispatchAdmin />; }
