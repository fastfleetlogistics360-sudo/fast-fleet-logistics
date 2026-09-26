import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupportQueue } from "@/lib/support/management";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Customer Care is temporarily unavailable. Real support cases could not be loaded." }, { status: 503 });
  const now = new Date().toISOString();
  await db.from("support_tickets").update({ status: "closed", closed_at: now, last_activity_at: now }).eq("status", "resolved").lte("resolved_at", new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString());
  const params = new URL(request.url).searchParams;
  const status = params.get("status"); const priority = params.get("priority"); const queue = params.get("queue"); const category = params.get("category"); const assignment = params.get("assignment"); const search = (params.get("search") || "").trim().slice(0, 100).replace(/[,%()]/g, ""); const page = Math.max(0, Number(params.get("page") || 0)); const limit = Math.min(100, Math.max(10, Number(params.get("limit") || 30)));
  if (queue && !isSupportQueue(queue)) return NextResponse.json({ error: "Choose a valid support queue." }, { status: 400 });
  let query = db
    .from("support_tickets")
    .select("id, case_number, user_id, persona, category, subcategory, support_queue, topic, subject, priority, status, delivery_id, tracking_code, contact_name, contact_email, contact_phone, assigned_admin_id, created_at, updated_at, last_activity_at, customer_last_read_at, admin_last_read_at, resolved_at, closed_at, first_responded_at, sla_first_response_at, sla_resolution_at, deliveries(delivery_code, status)")
    .order("last_activity_at", { ascending: false });
  if (status) query = query.eq("status", status); if (priority && ["normal", "high", "urgent"].includes(priority)) query = query.eq("priority", priority); if (queue) query = query.eq("support_queue", queue); if (category) query = query.eq("category", category); if (assignment === "unassigned") query = query.is("assigned_admin_id", null); if (assignment === "me") query = query.eq("assigned_admin_id", admin.userId); if (search) query = query.or(`case_number.ilike.%${search}%,subject.ilike.%${search}%,contact_name.ilike.%${search}%,contact_email.ilike.%${search}%,tracking_code.ilike.%${search}%`);
  const { data, error } = await query.range(page * limit, page * limit + limit - 1);
  if (error) return NextResponse.json({ error: "Could not load real support cases." }, { status: 503 });
  const ids = (data || []).map((item: any) => item.id);
  const { data: messageSummary } = ids.length ? await db.from("support_messages").select("ticket_id, sender_type, created_at").in("ticket_id", ids) : { data: [] };
  const cases = (data || []).map((item: any) => ({
    ...item,
    customerUnread: (messageSummary || []).some((message: any) => message.ticket_id === item.id && message.sender_type === "customer" && (!item.admin_last_read_at || new Date(message.created_at) > new Date(item.admin_last_read_at)))
  }));
  return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store" } });
}
