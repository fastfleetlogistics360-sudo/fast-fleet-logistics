import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransitionSupportCase, isSupportStatus, isUuid } from "@/lib/support/cases";
import { defaultPriority, defaultQueue, isSupportQueue, slaDeadlines, validCategory } from "@/lib/support/management";
import { recordSupportEvent } from "@/lib/support/events";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable." }, { status: 503 });
  const { data, error } = await db
    .from("support_tickets")
    .select("id, case_number, user_id, persona, category, subcategory, support_queue, topic, subject, message, priority, status, delivery_id, tracking_code, contact_name, contact_email, contact_phone, assigned_admin_id, created_at, updated_at, last_activity_at, customer_last_read_at, admin_last_read_at, resolved_at, closed_at, first_responded_at, sla_first_response_at, sla_resolution_at, deliveries(id, delivery_code, status, rider_id, pickup_address, dropoff_address, price_ngn, eta_minutes), support_messages(id, sender_type, sender_user_id, body, visibility, message_type, created_at), support_case_events(id, actor_type, event_type, metadata, created_at)")
    .eq("id", id).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  await db.from("support_tickets").update({ admin_last_read_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ case: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id, user_id, persona, category, subcategory, support_queue, priority, status, assigned_admin_id, case_number, first_responded_at").eq("id", id).maybeSingle<any>();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const changes: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  const events: Array<{ eventType: string; metadata?: Record<string, unknown> }> = [];
  if (body.status !== undefined) {
    if (!isSupportStatus(body.status) || !canTransitionSupportCase(supportCase.status, body.status)) return NextResponse.json({ error: "That case status transition is not allowed." }, { status: 400 });
    changes.status = body.status;
    if (body.status === "resolved") changes.resolved_at = new Date().toISOString();
    if (body.status === "closed") changes.closed_at = new Date().toISOString();
    if (body.status === "in_progress" && ["resolved", "closed"].includes(supportCase.status)) { changes.resolved_at = null; changes.closed_at = null; }
    events.push({ eventType: body.status === "resolved" ? "CASE_RESOLVED" : body.status === "closed" ? "CASE_CLOSED" : body.status === "in_progress" && ["resolved", "closed"].includes(supportCase.status) ? "CASE_REOPENED" : "STATUS_CHANGED", metadata: { from: supportCase.status, to: body.status } });
  }
  if (body.priority !== undefined) {
    if (!["low", "normal", "high", "urgent"].includes(body.priority)) return NextResponse.json({ error: "Choose a valid priority." }, { status: 400 });
    changes.priority = body.priority;
    if (body.priority !== supportCase.priority) { const deadlines = slaDeadlines(body.priority); changes.sla_first_response_at = deadlines.firstResponseAt.toISOString(); changes.sla_resolution_at = deadlines.resolutionAt.toISOString(); events.push({ eventType: "PRIORITY_CHANGED", metadata: { from: supportCase.priority, to: body.priority } }); }
  }
  if (body.category !== undefined || body.subcategory !== undefined) {
    const category = body.category ?? supportCase.category; const subcategory = body.subcategory ?? supportCase.subcategory;
    if (!validCategory(supportCase.persona, category, subcategory)) return NextResponse.json({ error: "That category is not valid for this case persona." }, { status: 400 });
    changes.category = category; changes.subcategory = subcategory; events.push({ eventType: "CATEGORY_CHANGED", metadata: { from: { category: supportCase.category, subcategory: supportCase.subcategory }, to: { category, subcategory } } });
    if (!supportCase.category) { changes.support_queue = defaultQueue(category); changes.priority = defaultPriority(category); const deadlines = slaDeadlines(defaultPriority(category)); changes.sla_first_response_at = deadlines.firstResponseAt.toISOString(); changes.sla_resolution_at = deadlines.resolutionAt.toISOString(); }
  }
  if (body.queue !== undefined) { if (!isSupportQueue(body.queue)) return NextResponse.json({ error: "Choose a valid support queue." }, { status: 400 }); changes.support_queue = body.queue; if (body.queue !== supportCase.support_queue) events.push({ eventType: "QUEUE_CHANGED", metadata: { from: supportCase.support_queue, to: body.queue } }); }
  if (body.assignToMe === true || body.assignedAdminId !== undefined) { const assignee = body.assignToMe ? admin.userId : body.assignedAdminId === null ? null : String(body.assignedAdminId); if (assignee !== null && !isUuid(assignee)) return NextResponse.json({ error: "Choose a valid support agent." }, { status: 400 }); if (assignee) { const { data: agent } = await db.from("profiles").select("user_id, is_admin, deleted_at").eq("user_id", assignee).maybeSingle<{ user_id: string; is_admin: boolean; deleted_at: string | null }>(); if (!agent?.is_admin || agent.deleted_at) return NextResponse.json({ error: "That support agent is not authorized." }, { status: 400 }); } changes.assigned_admin_id = assignee; if (assignee !== supportCase.assigned_admin_id) events.push({ eventType: assignee ? "AGENT_ASSIGNED" : "AGENT_UNASSIGNED", metadata: { from: supportCase.assigned_admin_id, to: assignee } }); }
  const { data, error } = await db.from("support_tickets").update(changes).eq("id", id).select("id, status, priority, assigned_admin_id, resolved_at, closed_at").single();
  if (error) return NextResponse.json({ error: "Could not update the support case." }, { status: 503 });
  await Promise.all(events.map((event) => recordSupportEvent(db, { ticketId: id, actorUserId: admin.userId, actorType: "agent", eventType: event.eventType, metadata: event.metadata })));
  if (body.status === "resolved" && supportCase.user_id) await insertNotificationWithPush(db, { user_id: supportCase.user_id, title: "Your support case was resolved", body: `${supportCase.case_number}: review the resolution or reply within 7 days if you still need help.`, type: "support_case_resolved", metadata: { url: `/support/cases/${id}`, case_id: id } });
  return NextResponse.json({ case: data });
}
