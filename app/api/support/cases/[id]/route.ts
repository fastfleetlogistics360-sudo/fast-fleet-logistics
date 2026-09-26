import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid, shouldAutoClose } from "@/lib/support/cases";

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
  if (supportCase.status === "resolved" && shouldAutoClose((supportCase as any).resolved_at)) {
    const closedAt = new Date().toISOString();
    await db.from("support_tickets").update({ status: "closed", closed_at: closedAt, last_activity_at: closedAt }).eq("id", id).eq("user_id", user.id);
    supportCase = { ...supportCase, status: "closed", closed_at: closedAt } as any;
  }
  await db.from("support_tickets").update({ customer_last_read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  const { data: messages } = await db.from("support_messages").select("id, sender_type, body, created_at").eq("ticket_id", id).eq("visibility", "public").order("created_at");
  return NextResponse.json({ case: { ...supportCase, support_messages: messages || [] } }, { headers: { "Cache-Control": "no-store" } });
}
