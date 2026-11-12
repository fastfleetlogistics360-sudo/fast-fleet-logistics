import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { hasAutomationPermission } from "@/lib/automation/permissions";
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
    if (action === "create_campaign" || action === "update_campaign") return campaign(db, admin.userId, body, action === "create_campaign");
    if (action === "create_template" || action === "update_template" || action === "duplicate_template") return template(db, admin.userId, body, action);
    if (action === "create_content" || action === "update_content") return content(db, admin.userId, body, action === "create_content");
    if (action === "transition_content") return transition(db, admin.userId, body);
    if (action === "create_department" || action === "update_department") {
      if (!(await hasAutomationPermission(admin.userId, "super_admin"))) return NextResponse.json({ error: "FAST AI Super Admin permission required." }, { status: 403 });
      return department(db, admin.userId, body, action === "create_department");
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
  if (action === "create_template") { const { data, error } = await db.from("marketing_templates").insert({ name, channel, content, department_id: uuidOrNull(body.departmentId), created_by: actor, updated_by: actor }).select().single(); if (error) throw error; await db.from("marketing_template_versions").insert({ template_id: data.id, version: 1, content, created_by: actor }); return NextResponse.json({ template: data }); }
  const id = requiredUuid(body.id, "Template");
  if (action === "duplicate_template") { const { data: source, error: sourceError } = await db.from("marketing_templates").select("name, channel, content, department_id").eq("id", id).single(); if (sourceError) throw sourceError; const { data, error } = await db.from("marketing_templates").insert({ name: `${source.name} copy`.slice(0, 160), channel: source.channel, content: source.content, department_id: source.department_id, source_template_id: id, created_by: actor, updated_by: actor }).select().single(); if (error) throw error; await db.from("marketing_template_versions").insert({ template_id: data.id, version: 1, content: source.content, created_by: actor }); return NextResponse.json({ template: data }); }
  const { data: current, error: currentError } = await db.from("marketing_templates").select("version").eq("id", id).single(); if (currentError) throw currentError; const version = Number(current.version || 1) + 1;
  const status = text(body.status, 20); const { data, error } = await db.from("marketing_templates").update({ name, channel, content, department_id: uuidOrNull(body.departmentId), version, status: ["draft","active","archived"].includes(status) ? status : "draft", archived_at: status === "archived" ? new Date().toISOString() : null, archived_by: status === "archived" ? actor : null, updated_by: actor }).eq("id", id).select().single(); if (error) throw error; await db.from("marketing_template_versions").insert({ template_id: id, version, content, created_by: actor }); return NextResponse.json({ template: data });
}

async function content(db: NonNullable<ReturnType<typeof createAdminClient>>, actor: string, body: Record<string, unknown>, create: boolean) {
  const channel = text(body.channel, 40), title = text(body.title, 240), draft_content = contentObject(body.content); if (!validChannel(channel)) throw new Error("Choose a supported content channel.");
  const base = { channel, title, draft_content, campaign_id: uuidOrNull(body.campaignId), template_id: uuidOrNull(body.templateId), department_id: uuidOrNull(body.departmentId), updated_by: actor };
  if (create) { const { data, error } = await db.from("marketing_posts").insert({ ...base, created_by: actor, status: "draft" }).select().single(); if (error) throw error; await db.from("marketing_content_versions").insert({ post_id: data.id, version: 1, title, content: draft_content, created_by: actor, reason: "Created" }); return NextResponse.json({ content: data }); }
  const id = requiredUuid(body.id, "Content"); const { data: current, error: currentError } = await db.from("marketing_posts").select("content_version").eq("id", id).single(); if (currentError) throw currentError; const version = Number(current.content_version || 1) + 1;
  const { data, error } = await db.from("marketing_posts").update({ ...base, content_version: version }).eq("id", id).select().single(); if (error) throw error; await db.from("marketing_content_versions").insert({ post_id: id, version, title, content: draft_content, created_by: actor, reason: "Edited" }); return NextResponse.json({ content: data });
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
