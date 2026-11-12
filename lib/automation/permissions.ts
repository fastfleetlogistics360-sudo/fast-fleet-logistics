import { createAdminClient } from "@/lib/supabase/admin";

export type AutomationPermission = "viewer" | "operator" | "approver" | "super_admin";
const ranks: Record<AutomationPermission, number> = { viewer: 1, operator: 2, approver: 3, super_admin: 4 };

export async function automationPermissionFor(userId: string): Promise<AutomationPermission | null> {
  const superAdmin = process.env.FAST_AI_SUPER_ADMIN_USER_ID?.trim();
  if (superAdmin && superAdmin === userId) return "super_admin";
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db.from("automation_admin_permissions").select("role").eq("user_id", userId).maybeSingle<{ role?: AutomationPermission }>();
  return data?.role && data.role in ranks ? data.role : "viewer";
}

export async function hasAutomationPermission(userId: string, minimum: AutomationPermission) {
  const permission = await automationPermissionFor(userId);
  return permission !== null && ranks[permission] >= ranks[minimum];
}

export type DepartmentPermission = "viewer" | "editor" | "approver" | "manager";
const departmentRanks: Record<DepartmentPermission, number> = { viewer: 1, editor: 2, approver: 3, manager: 4 };

export async function automationDepartmentIdsFor(userId: string) {
  if ((await automationPermissionFor(userId)) === "super_admin") return null;
  const db = createAdminClient();
  if (!db) return [];
  const { data } = await db.from("automation_department_memberships").select("department_id").eq("user_id", userId);
  return (data || []).map((row: { department_id?: string | null }) => row.department_id).filter((id): id is string => Boolean(id));
}

export async function hasDepartmentPermission(userId: string, departmentId: string | null, minimum: DepartmentPermission) {
  if ((await automationPermissionFor(userId)) === "super_admin") return true;
  if (!departmentId) return false;
  const db = createAdminClient();
  if (!db) return false;
  const { data } = await db.from("automation_department_memberships").select("role").eq("user_id", userId).eq("department_id", departmentId).maybeSingle<{ role?: DepartmentPermission }>();
  return Boolean(data?.role && departmentRanks[data.role] >= departmentRanks[minimum]);
}
