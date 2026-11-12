import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { automationPermissionFor, hasAutomationPermission } from "@/lib/automation/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const safeSelect = "id, provider, account_label, external_account_id, credential_expires_at, scopes, status, last_verified_at, created_at, updated_at";
const flags = ["foundation_enabled", "website_campaigns_enabled", "instagram_publishing_enabled", "zoho_campaigns_enabled", "whatsapp_marketing_enabled"] as const;
type Flag = (typeof flags)[number];
const channels = ["instagram", "zoho", "whatsapp_marketing"] as const;
const permissionRoles = ["viewer", "operator", "approver", "super_admin"] as const;

export async function GET() {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Automation foundation is unavailable." }, { status: 503 });
  const [settings, accounts, campaigns, posts, jobs, logs, approvals, permissions] = await Promise.all([
    db.from("automation_settings").select("foundation_enabled, website_campaigns_enabled, instagram_publishing_enabled, zoho_campaigns_enabled, whatsapp_marketing_enabled, global_paused, paused_channels, updated_at").eq("id", true).maybeSingle(),
    db.from("publishing_accounts").select(safeSelect).order("created_at", { ascending: false }),
    db.from("marketing_campaigns").select("id, name, objective, channel, status, starts_at, ends_at, created_at").order("created_at", { ascending: false }).limit(30),
    db.from("marketing_posts").select("id, channel, status, scheduled_for, created_at, updated_at").order("updated_at", { ascending: false }).limit(30),
    db.from("marketing_job_outbox").select("id, channel, status, run_after, attempt_count, max_attempts, last_error_code, created_at").order("created_at", { ascending: false }).limit(30),
    db.from("publishing_logs").select("id, provider, event_type, outcome, response_code, created_at").order("created_at", { ascending: false }).limit(30),
    db.from("marketing_approval_events").select("id, post_id, event_type, from_status, to_status, reason, created_at").order("created_at", { ascending: false }).limit(30),
    db.from("automation_admin_permissions").select("user_id, role, updated_at").order("updated_at", { ascending: false }).limit(50)
  ]);
  const failed = [settings, accounts, campaigns, posts, jobs, logs, approvals, permissions].find((result) => result.error);
  if (failed?.error) return NextResponse.json({ error: "FAST AI migration has not been applied or is unavailable." }, { status: 503 });
  const permission = await automationPermissionFor(admin.userId);
  return NextResponse.json({ permission: permission || "viewer", settings: settings.data, accounts: accounts.data || [], campaigns: campaigns.data || [], posts: posts.data || [], jobs: jobs.data || [], logs: logs.data || [], approvals: approvals.data || [], permissions: permissions.data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;
  if (!(await hasAutomationPermission(admin.userId, "super_admin"))) return NextResponse.json({ error: "FAST AI Super Admin permission required." }, { status: 403 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Automation foundation is unavailable." }, { status: 503 });
  if (body.action === "set_permission" && typeof body.userId === "string" && isUuid(body.userId) && typeof body.role === "string" && permissionRoles.includes(body.role as typeof permissionRoles[number])) {
    const { error } = await db.from("automation_admin_permissions").upsert({ user_id: body.userId, role: body.role, updated_by: admin.userId, created_by: admin.userId }, { onConflict: "user_id" });
    if (error) return NextResponse.json({ error: "Could not update automation permission." }, { status: 503 });
    await db.from("communication_logs").insert({ channel: "website", event_type: "automation_permission_changed", metadata: { role: body.role, actor_id: admin.userId } });
    return NextResponse.json({ ok: true });
  }
  const patch: Record<string, unknown> = { updated_by: admin.userId };
  if (body.action === "set_global_pause" && typeof body.paused === "boolean") patch.global_paused = body.paused;
  else if (body.action === "set_channel_pause" && typeof body.channel === "string" && channels.includes(body.channel as typeof channels[number]) && typeof body.paused === "boolean") {
    const { data: current } = await db.from("automation_settings").select("paused_channels").eq("id", true).single<{ paused_channels?: unknown }>();
    const paused = new Set(Array.isArray(current?.paused_channels) ? current!.paused_channels.filter((v): v is string => typeof v === "string") : []);
    if (body.paused) paused.add(body.channel);
    else paused.delete(body.channel);
    patch.paused_channels = Array.from(paused);
  } else if (body.action === "set_flag" && typeof body.flag === "string" && flags.includes(body.flag as Flag) && typeof body.enabled === "boolean") patch[body.flag] = body.enabled;
  else return NextResponse.json({ error: "Invalid automation setting request." }, { status: 400 });
  const { data, error } = await db.from("automation_settings").update(patch).eq("id", true).select("foundation_enabled, website_campaigns_enabled, instagram_publishing_enabled, zoho_campaigns_enabled, whatsapp_marketing_enabled, global_paused, paused_channels, updated_at").single();
  if (error) return NextResponse.json({ error: "Could not update automation settings." }, { status: 503 });
  await db.from("communication_logs").insert({ channel: "website", event_type: "automation_setting_changed", metadata: { action: body.action, actor_id: admin.userId } });
  return NextResponse.json({ settings: data });
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
