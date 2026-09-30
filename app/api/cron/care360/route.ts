import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { recordSupportEvent } from "@/lib/support/events";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const AUTO_CLOSE_AFTER_MS = 72 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) return response({ error: authorization.reason === "misconfigured" ? "Care360 job is not securely configured." : "Care360 job authorization required." }, authorization.reason === "misconfigured" ? 503 : 401);
  const limited = await enforceRateLimit(request, rateLimitPolicies.cronCare360);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return response({ error: "Care360 job is unavailable." }, 503);
  const now = new Date();
  const nowIso = now.toISOString();
  try {
    const { data: resolved, error: resolvedError } = await db.from("support_tickets").select("id, user_id, case_number").eq("status", "resolved").lte("resolved_at", new Date(now.getTime() - AUTO_CLOSE_AFTER_MS).toISOString()).is("lifecycle_closed_at", null).limit(100);
    if (resolvedError) throw resolvedError;
    let closed = 0;
    for (const item of resolved || []) {
      const { data: changed, error } = await db.from("support_tickets").update({ status: "closed", closed_at: nowIso, lifecycle_closed_at: nowIso, last_activity_at: nowIso }).eq("id", item.id).eq("status", "resolved").is("lifecycle_closed_at", null).select("id").maybeSingle();
      if (error) throw error;
      if (!changed) continue;
      closed++;
      await recordSupportEvent(db, { ticketId: item.id, actorUserId: null, actorType: "system", eventType: "CASE_AUTO_CLOSED" });
      if (item.user_id) void insertNotificationWithPush(db, { user_id: item.user_id, title: "Support case closed", body: `${item.case_number || "Your case"} was closed after the resolution window. You can create a new case if you still need help.`, type: "support_case_closed", metadata: { url: `/support/cases/${item.id}`, case_id: item.id } }).catch(() => undefined);
    }
    const { data: active, error: activeError } = await db.from("support_tickets").select("id, assigned_admin_id, first_responded_at, sla_first_response_at, sla_resolution_at, first_response_sla_escalated_at, resolution_sla_escalated_at").not("status", "in", "(resolved,closed)").limit(200);
    if (activeError) throw activeError;
    let firstResponseBreaches = 0; let resolutionBreaches = 0;
    for (const item of active || []) {
      const firstDue = item.sla_first_response_at && new Date(item.sla_first_response_at).getTime() < now.getTime() && !item.first_responded_at && !item.first_response_sla_escalated_at;
      const resolutionDue = item.sla_resolution_at && new Date(item.sla_resolution_at).getTime() < now.getTime() && !item.resolution_sla_escalated_at;
      if (firstDue) {
        const { data: changed } = await db.from("support_tickets").update({ first_response_sla_escalated_at: nowIso }).eq("id", item.id).is("first_response_sla_escalated_at", null).select("id").maybeSingle();
        if (changed) { firstResponseBreaches++; await recordSupportEvent(db, { ticketId: item.id, actorUserId: null, actorType: "system", eventType: "FIRST_RESPONSE_SLA_BREACHED" }); }
      }
      if (resolutionDue) {
        const { data: changed } = await db.from("support_tickets").update({ resolution_sla_escalated_at: nowIso }).eq("id", item.id).is("resolution_sla_escalated_at", null).select("id").maybeSingle();
        if (changed) { resolutionBreaches++; await recordSupportEvent(db, { ticketId: item.id, actorUserId: null, actorType: "system", eventType: "RESOLUTION_SLA_BREACHED" }); }
      }
    }
    // The RPC reclaims a stale processing lock atomically, so including it here
    // enables recovery without allowing concurrent handoff processing.
    const { data: handoffs, error: handoffError } = await db.from("support_proactive_handoffs").select("id").in("status", ["pending", "processing"]).lte("next_attempt_at", nowIso).order("next_attempt_at", { ascending: true }).limit(25);
    if (handoffError) throw handoffError;
    let proactiveCompleted = 0;
    for (const handoff of handoffs || []) {
      const { data: processed, error: processError } = await db.rpc("process_support_proactive_handoff", { next_handoff_id: handoff.id });
      if (processError) continue;
      const result = Array.isArray(processed) ? processed[0] : processed;
      if (!result?.completed || !result.ticket_id) continue;
      proactiveCompleted++;
      if (result.created) {
        const { data: admins } = await db.from("profiles").select("user_id").eq("is_admin", true).is("deleted_at", null).limit(100);
        await Promise.allSettled((admins || []).map((staff) => insertNotificationWithPush(db, { user_id: staff.user_id, title: "Care360 review needed", body: "A delivery check needs Customer Care review.", type: "support_proactive_case", metadata: { url: "/admin/customer-care", case_id: result.ticket_id } })));
      }
    }
    return response({ ok: true, closed, firstResponseBreaches, resolutionBreaches, proactiveCompleted }, 200);
  } catch { return response({ error: "Care360 job could not complete." }, 503); }
}

function response(body: Record<string, unknown>, status: number) { const result = NextResponse.json(body, { status }); result.headers.set("Cache-Control", "no-store"); return result; }
