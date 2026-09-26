import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/support/cases";
import { recordSupportEvent } from "@/lib/support/events";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const reply = typeof body.body === "string" ? body.body.trim() : "";
  if (reply.length < 2 || reply.length > 2_000) return NextResponse.json({ error: "Replies must contain between 2 and 2,000 characters." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id, user_id, case_number, first_responded_at").eq("id", id).maybeSingle<any>();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const { data, error } = await db.from("support_messages").insert({ ticket_id: id, sender_type: "admin", sender_user_id: admin.userId, body: reply, visibility: "public", message_type: "message" }).select("id, sender_type, body, created_at").single();
  if (error) return NextResponse.json({ error: "Could not send the reply." }, { status: 503 });
  const now = new Date().toISOString();
  await db.from("support_tickets").update({ status: "in_progress", assigned_admin_id: admin.userId, first_responded_at: supportCase.first_responded_at || now, last_activity_at: now }).eq("id", id);
  await recordSupportEvent(db, { ticketId: id, actorUserId: admin.userId, actorType: "agent", eventType: "AGENT_MESSAGE" });
  if (supportCase.user_id) await insertNotificationWithPush(db, { user_id: supportCase.user_id, title: "New reply from Fast Fleets 360 Support", body: `${supportCase.case_number}: ${reply.slice(0, 120)}`, type: "support_agent_replied", metadata: { url: `/support/cases/${id}`, case_id: id } });
  return NextResponse.json({ message: data });
}
