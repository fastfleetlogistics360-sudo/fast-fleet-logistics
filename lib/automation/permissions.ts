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
