import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable. Real support cases could not be loaded." }, { status: 503 });
  const now = new Date().toISOString();
  await db.from("support_tickets").update({ status: "closed", closed_at: now, last_activity_at: now }).eq("status", "resolved").lte("resolved_at", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());
  const { data, error } = await db
    .from("support_tickets")
    .select("id, case_number, user_id, topic, subject, message, priority, status, delivery_id, tracking_code, contact_name, contact_email, contact_phone, assigned_admin_id, created_at, updated_at, last_activity_at, customer_last_read_at, admin_last_read_at, resolved_at, closed_at, deliveries(delivery_code, status), support_messages(id, sender_type, body, created_at)")
    .order("last_activity_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load real support cases." }, { status: 503 });
  const cases = (data || []).map((item: any) => ({
    ...item,
    customerUnread: (item.support_messages || []).some((message: any) => message.sender_type === "customer" && (!item.admin_last_read_at || new Date(message.created_at) > new Date(item.admin_last_read_at)))
  }));
  return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store" } });
}
