import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { shouldAutoClose } from "@/lib/support/cases";

export const dynamic = "force-dynamic";

export async function GET() {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to view support cases." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Support cases are temporarily unavailable." }, { status: 503 });
  const now = new Date().toISOString();
  await db.from("support_tickets").update({ status: "closed", closed_at: now, last_activity_at: now }).eq("user_id", user.id).eq("status", "resolved").lte("resolved_at", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());
  const { data, error } = await db
    .from("support_tickets")
    .select("id, case_number, topic, subject, priority, status, delivery_id, tracking_code, created_at, updated_at, last_activity_at, customer_last_read_at, resolved_at, closed_at, support_messages(sender_type, created_at)")
    .eq("user_id", user.id)
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load support cases." }, { status: 503 });
  const cases = (data || []).map((item: any) => ({
    ...item,
    unread: (item.support_messages || []).some((message: any) => message.sender_type === "admin" && (!item.customer_last_read_at || new Date(message.created_at) > new Date(item.customer_last_read_at))),
    autoCloseEligible: shouldAutoClose(item.resolved_at)
  }));
  return NextResponse.json({ cases, availability: supportAvailability() }, { headers: { "Cache-Control": "no-store" } });
}

function supportAvailability() {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).find((part) => part.type === "hour")?.value || "0");
  return { staffed: hour >= 8 && hour < 20, timezone: "Africa/Lagos", staffedHours: "08:00–20:00 WAT daily" };
}
