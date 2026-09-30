import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/support/cases";
import { getSupportCaseContext } from "@/lib/support/context";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to view this support case." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Support cases are temporarily unavailable." }, { status: 503 });
  let { data: supportCase, error } = await db
    .from("support_tickets")
    .select("id, case_number, topic, subject, message, priority, status, delivery_id, tracking_code, created_at, updated_at, last_activity_at, resolved_at, closed_at, deliveries(delivery_code, status)")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const page = Math.max(0, Number(new URL(_.url).searchParams.get("messagePage") || 0));
  const [{ data: messages }, { data: attachments }] = await Promise.all([
    db.from("support_messages").select("id, sender_type, body, created_at").eq("ticket_id", id).eq("visibility", "public").order("created_at", { ascending: false }).range(page * 50, page * 50 + 49),
    db.from("support_case_attachments").select("id, original_filename, content_type, byte_size, created_at").eq("ticket_id", id).eq("visibility", "public").eq("status", "finalized").order("created_at", { ascending: false }).range(0, 49)
  ]);
  const context = await getSupportCaseContext(db, id).catch(() => []);
  // Only acknowledge the newest public message actually returned to the open
  // first page. A concurrent reply therefore remains unread for the customer.
  const observedAt = page === 0 ? messages?.[0]?.created_at : null;
  if (observedAt) await db.from("support_tickets").update({ customer_last_read_at: observedAt }).eq("id", id).eq("user_id", user.id).or(`customer_last_read_at.is.null,customer_last_read_at.lte.${observedAt}`);
  const { data: timeline } = await db.from("support_case_events").select("id, event_type, created_at").eq("ticket_id", id).in("event_type", ["CASE_CREATED", "AGENT_MESSAGE", "CASE_RESOLVED", "CASE_REOPENED", "CASE_AUTO_CLOSED", "CASE_CLOSED"]).order("created_at", { ascending: false }).range(0, 19);
  return NextResponse.json({ case: { ...supportCase, support_messages: (messages || []).reverse(), attachments: attachments || [], timeline: (timeline || []).reverse(), context }, messagePage: page, hasMoreMessages: (messages || []).length === 50 }, { headers: { "Cache-Control": "no-store" } });
}
