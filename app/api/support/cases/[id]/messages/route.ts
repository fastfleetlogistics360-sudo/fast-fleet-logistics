import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { canCustomerReopen, isUuid } from "@/lib/support/cases";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to reply." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.supportMessageCreate);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const message = typeof body.body === "string" ? body.body.trim() : "";
  if (message.length < 2 || message.length > 2_000) return NextResponse.json({ error: "Replies must contain between 2 and 2,000 characters." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Support is temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id, status, resolved_at, assigned_admin_id").eq("id", id).eq("user_id", user.id).maybeSingle<any>();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  if (["resolved", "closed"].includes(supportCase.status) && !canCustomerReopen(supportCase.resolved_at)) return NextResponse.json({ error: "This case is closed. Please create a new support case." }, { status: 409 });
  const now = new Date().toISOString();
  const { data, error } = await db.from("support_messages").insert({ ticket_id: id, sender_type: "customer", sender_user_id: user.id, body: message }).select("id, sender_type, body, created_at").single();
  if (error) return NextResponse.json({ error: "Could not send your reply." }, { status: 503 });
  const reopening = ["resolved", "closed"].includes(supportCase.status);
  await db.from("support_tickets").update({ status: "in_progress", resolved_at: reopening ? null : supportCase.resolved_at, closed_at: reopening ? null : undefined, last_activity_at: now }).eq("id", id).eq("user_id", user.id);
  if (reopening && supportCase.assigned_admin_id) await insertNotificationWithPush(db, { user_id: supportCase.assigned_admin_id, title: "Support case reopened", body: "A customer replied to a resolved support case.", type: "support_case_reopened", metadata: { url: `/admin/customer-care`, case_id: id } });
  return NextResponse.json({ message: data, reopened: reopening });
}
