import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canTransitionSupportCase, isSupportStatus, isUuid } from "@/lib/support/cases";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable." }, { status: 503 });
  const { data, error } = await db
    .from("support_tickets")
    .select("id, case_number, user_id, topic, subject, message, priority, status, delivery_id, tracking_code, contact_name, contact_email, contact_phone, assigned_admin_id, created_at, updated_at, last_activity_at, customer_last_read_at, admin_last_read_at, resolved_at, closed_at, deliveries(id, delivery_code, status, rider_id, pickup_address, dropoff_address, price_ngn, eta_minutes), support_messages(id, sender_type, sender_user_id, body, created_at)")
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
  const { data: supportCase } = await db.from("support_tickets").select("id, user_id, status, assigned_admin_id, case_number").eq("id", id).maybeSingle<any>();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const changes: Record<string, unknown> = { last_activity_at: new Date().toISOString() };
  if (body.status !== undefined) {
    if (!isSupportStatus(body.status) || !canTransitionSupportCase(supportCase.status, body.status)) return NextResponse.json({ error: "That case status transition is not allowed." }, { status: 400 });
    changes.status = body.status;
    if (body.status === "resolved") changes.resolved_at = new Date().toISOString();
    if (body.status === "closed") changes.closed_at = new Date().toISOString();
    if (body.status === "in_progress" && ["resolved", "closed"].includes(supportCase.status)) { changes.resolved_at = null; changes.closed_at = null; }
  }
  if (body.priority !== undefined) {
    if (!["low", "normal", "high", "urgent"].includes(body.priority)) return NextResponse.json({ error: "Choose a valid priority." }, { status: 400 });
    changes.priority = body.priority;
  }
  if (body.assignToMe === true) changes.assigned_admin_id = admin.userId;
  const { data, error } = await db.from("support_tickets").update(changes).eq("id", id).select("id, status, priority, assigned_admin_id, resolved_at, closed_at").single();
  if (error) return NextResponse.json({ error: "Could not update the support case." }, { status: 503 });
  if (body.status === "resolved" && supportCase.user_id) await insertNotificationWithPush(db, { user_id: supportCase.user_id, title: "Your support case was resolved", body: `${supportCase.case_number}: review the resolution or reply within 7 days if you still need help.`, type: "support_case_resolved", metadata: { url: `/support/cases/${id}`, case_id: id } });
  return NextResponse.json({ case: data });
}
