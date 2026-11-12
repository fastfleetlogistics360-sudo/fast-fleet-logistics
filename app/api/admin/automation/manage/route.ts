import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { hasAutomationPermission, hasDepartmentPermission } from "@/lib/automation/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const channels = ["website", "instagram", "zoho_email", "whatsapp_marketing"] as const;
const campaignStatuses = ["draft", "in_review", "approved", "scheduled", "completed", "rejected", "archived"] as const;
const text = (value: unknown, limit: number) => typeof value === "string" ? value.trim().slice(0, limit) : "";
const validChannel = (value: string): value is typeof channels[number] => channels.includes(value as typeof channels[number]);

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = text(body.action, 60);
  const privilegedDecision = action === "transition_content" && ["approved", "rejected", "revision_requested"].includes(text(body.status, 40));
  if (!(await hasAutomationPermission(admin.userId, privilegedDecision ? "approver" : "operator"))) return NextResponse.json({ error: privilegedDecision ? "FAST AI approver permission required." : "FAST AI operator permission required." }, { status: 403 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Automation foundation is unavailable." }, { status: 503 });
  try {
    const departmentCheck = await authorizeDepartmentAction(db, admin.userId, action, body, privilegedDecision);
    if (!departmentCheck) return NextResponse.json({ error: "Department-scoped FAST AI permission required." }, { status: 403 });
    if (action === "create_campaign" || action === "update_campaign") return campaign(db, admin.userId, body, action === "create_campaign");
    if (action === "create_template" || action === "update_template" || action === "duplicate_template") return template(db, admin.userId, body, action);
    if (action === "create_content" || action === "update_content") return content(db, admin.userId, body, action === "create_content");
    if (action === "transition_content") return transition(db, admin.userId, body);
    if (action === "create_department" || action === "update_department") {
      if (!(await hasAutomationPermission(admin.userId, "super_admin"))) return NextResponse.json({ error: "FAST AI Super Admin permission required." }, { status: 403 });
      return department(db, admin.userId, body, action === "create_department");
    }
    if (action === "set_department_membership") {
      if (!(await hasAutomationPermission(admin.userId, "super_admin"))) return NextResponse.json({ error: "FAST AI Super Admin permission required." }, { status: 403 });
      const departmentId = requiredUuid(body.departmentId, "Department"); const userId = requiredUuid(body.userId, "User"); const role = text(body.role, 20);
      if (!["viewer", "editor", "approver", "manager"].includes(role)) return NextResponse.json({ error: "Unsupported department membership role." }, { status: 400 });
      const { data, error } = await db.from("automation_department_memberships").upsert({ department_id: departmentId, user_id: userId, role, created_by: admin.userId, updated_by: admin.userId }, { onConflict: "department_id,user_id" }).select().single();
      if (error) throw error;
      return NextResponse.json({ membership: data });
    }
    return NextResponse.json({ error: "Unsupported FAST AI management action." }, { status: 400 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message.slice(0, 240) : "FAST AI change could not be saved." }, { status: 400 }); }
}

async function campaign(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>, create: boolean) {
  const name = text(body.name, 180), objective = text(body.objective, 300), description = text(body.description, 3000), channel = text(body.channel, 40);
  if (!name || !objective || !validChannel(channel)) throw new Error("A name, objective, and supported channel are required.");
  const patch = { name, objective, description, channel, department_id: uuidOrNull(body.departmentId), proposed_schedule_at: isoOrNull(body.proposedSchedule), updated_by: actor };
  if (create) { const { data, error } = await db.from("marketing_campaigns").insert({ ...patch, status: "draft", created_by: actor }).select().single(); if (error) throw error; return NextResponse.json({ campaign: data }); }
  const id = requiredUuid(body.id, "Campaign");
  const status = text(body.status, 30); const changes: Record<string, unknown> = { ...patch };
  if (campaignStatuses.includes(status as typeof campaignStatuses[number])) { changes.status = status; if (status === "archived") { changes.archived_at = new Date().toISOString(); changes.archived_by = actor; } if (status === "draft") { changes.archived_at = null; changes.archived_by = null; } }
  const { data, error } = await db.from("marketing_campaigns").update(changes).eq("id", id).select().single(); if (error) throw error; return NextResponse.json({ campaign: data });
}

async function template(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>, action: string) {
  const channel = text(body.channel, 40), name = text(body.name, 160), content = contentObject(body.content);
  if (!name || !validChannel(channel)) throw new Error("A template name and supported channel are required.");
  const super_override = await hasAutomationPermission(actor, "super_admin");
  if (action === "create_template") { const { data, error } = await db.rpc("fast_ai_write_template", { target_id: null, next_name: name, next_channel: channel, next_content: content, next_department_id: uuidOrNull(body.departmentId), actor, create_new: true, super_override }); if (error) throw error; return NextResponse.json({ template: Array.isArray(data) ? data[0] : data }); }
  const id = requiredUuid(body.id, "Template");
  if (action === "duplicate_template") { const { data: source, error: sourceError } = await db.from("marketing_templates").select("name, channel, content, department_id").eq("id", id).single(); if (sourceError) throw sourceError; const { data, error } = await db.rpc("fast_ai_write_template", { target_id: null, next_name: `${source.name} copy`.slice(0, 160), next_channel: source.channel, next_content: source.content, next_department_id: source.department_id, actor, create_new: true, super_override }); if (error) throw error; return NextResponse.json({ template: Array.isArray(data) ? data[0] : data }); }
  const { data, error } = await db.rpc("fast_ai_write_template", { target_id: id, next_name: name, next_channel: channel, next_content: content, next_department_id: uuidOrNull(body.departmentId), actor, create_new: false, super_override }); if (error) throw error; return NextResponse.json({ template: Array.isArray(data) ? data[0] : data });
}

async function content(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>, create: boolean) {
  const channel = text(body.channel, 40), title = text(body.title, 240), draft_content = contentObject(body.content); if (!validChannel(channel)) throw new Error("Choose a supported content channel.");
  const super_override = await hasAutomationPermission(actor, "super_admin");
  if (create) { const { data, error } = await db.rpc("fast_ai_write_content", { target_id: null, next_title: title, next_channel: channel, next_content: draft_content, next_campaign_id: uuidOrNull(body.campaignId), next_template_id: uuidOrNull(body.templateId), next_department_id: uuidOrNull(body.departmentId), actor, create_new: true, super_override }); if (error) throw error; return NextResponse.json({ content: Array.isArray(data) ? data[0] : data }); }
  const id = requiredUuid(body.id, "Content"); const { data, error } = await db.rpc("fast_ai_write_content", { target_id: id, next_title: title, next_channel: channel, next_content: draft_content, next_campaign_id: uuidOrNull(body.campaignId), next_template_id: uuidOrNull(body.templateId), next_department_id: uuidOrNull(body.departmentId), actor, create_new: false, super_override }); if (error) throw error; return NextResponse.json({ content: Array.isArray(data) ? data[0] : data });
}

async function transition(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>) {
  const id = requiredUuid(body.id, "Content"), status = text(body.status, 40), note = text(body.note, 1200); if (!["reviewed","approved","rejected","revision_requested","draft","cancelled"].includes(status)) throw new Error("Unsupported approval decision.");
  const { data, error } = await db.rpc("transition_marketing_post", { target_post_id: id, next_status: status, actor, note: note || null }); if (error) throw error; return NextResponse.json({ content: Array.isArray(data) ? data[0] : data });
}

async function department(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>, create: boolean) {
  const name = text(body.name, 120), description = text(body.description, 1000); if (!name) throw new Error("Department name is required.");
  if (create) { const { data, error } = await db.from("automation_departments").insert({ name, description, permissions: contentObject(body.permissions), created_by: actor, updated_by: actor }).select().single(); if (error) throw error; return NextResponse.json({ department: data }); }
  const id = requiredUuid(body.id, "Department"); const { data, error } = await db.from("automation_departments").update({ name, description, permissions: contentObject(body.permissions), status: ["active","archived"].includes(text(body.status, 20)) ? text(body.status, 20) : "active", updated_by: actor }).eq("id", id).select().single(); if (error) throw error; return NextResponse.json({ department: data });
}

function contentObject(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function uuidOrNull(value: unknown) { const result = text(value, 80); return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(result) ? result : null; }
function requiredUuid(value: unknown, name: string) { const result = uuidOrNull(value); if (!result) throw new Error(`${name} identifier is required.`); return result; }
function isoOrNull(value: unknown) { const result = text(value, 40); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : null; }

async function authorizeDepartmentAction(db: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, action: string, body: Record<string, unknown>, privilegedDecision: boolean) {
  if (action.startsWith("create_") && action !== "create_department") return hasDepartmentPermission(userId, uuidOrNull(body.departmentId), "editor");
  if (action === "transition_content") {
    const id = requiredUuid(body.id, "Content"); const { data, error } = await db.from("marketing_posts").select("department_id, created_by").eq("id", id).single<{ department_id?: string | null; created_by?: string | null }>(); if (error || !data) return false;
    return hasDepartmentPermission(userId, data.department_id || null, privilegedDecision ? "approver" : "editor");
  }
  const table = action.includes("campaign") ? "marketing_campaigns" : action.includes("template") ? "marketing_templates" : action.includes("content") ? "marketing_posts" : null;
  if (!table || action.includes("department")) return true;
  const id = requiredUuid(body.id, "Record"); const { data, error } = await db.from(table).select("department_id, created_by").eq("id", id).single<{ department_id?: string | null; created_by?: string | null }>(); if (error || !data) return false;
  const requestedDepartment = uuidOrNull(body.departmentId);
  if (!requestedDepartment) return false;
  if (requestedDepartment && requestedDepartment !== data.department_id && !(await hasDepartmentPermission(userId, requestedDepartment, "editor"))) return false;
  if (data.created_by === userId) return hasDepartmentPermission(userId, data.department_id || null, "editor");
  return hasDepartmentPermission(userId, data.department_id || null, "manager");
}
