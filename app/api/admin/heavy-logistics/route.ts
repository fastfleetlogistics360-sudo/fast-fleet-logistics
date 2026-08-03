import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

const statuses = new Set(["submitted", "under_review", "quoted", "scheduled", "vehicle_assigned", "in_transit", "completed", "cancelled"]);

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to load heavy logistics requests." }, { status: 503 });

  const { data, error } = await supabase
    .from("heavy_logistics_requests")
    .select("id, request_code, category, item_type, quantity, pickup_address, pickup_access, dropoff_address, dropoff_access, contact_name, contact_phone, preferred_pickup_at, instructions, status, quoted_price_ngn, internal_notes, created_at, updated_at, users:users!heavy_logistics_requests_customer_id_fkey(full_name, phone, email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ requests: data || [] });
}

export async function PATCH(request: Request) {
  const adminContext = await requireAdminSession(request);
  if (!adminContext) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const quotedPrice = price(body.quotedPrice);
  const internalNotes = String(body.internalNotes || "").trim().slice(0, 1500) || null;
  if (!id || !statuses.has(status)) return NextResponse.json({ error: "Choose a valid request status." }, { status: 400 });
  if (status === "quoted" && quotedPrice === null) return NextResponse.json({ error: "Add the quoted price." }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to update heavy logistics requests." }, { status: 503 });

  const { data, error } = await supabase
    .from("heavy_logistics_requests")
    .update({
      status,
      quoted_price_ngn: quotedPrice,
      internal_notes: internalNotes,
      reviewed_by: adminContext.userId,
      reviewed_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id, request_code, customer_id, status, quoted_price_ngn")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await insertNotificationWithPush(supabase, {
    user_id: data.customer_id,
    title: customerTitle(status),
    body: data.request_code,
    type: "heavy_logistics_update",
    metadata: { heavy_logistics_request_id: data.id, request_code: data.request_code, status, url: `/heavy-logistics/${data.request_code}`, tag: `ff-heavy-${data.request_code}` }
  });

  return NextResponse.json({ request: data });
}

function price(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function customerTitle(status: string) {
  if (status === "quoted") return "Heavy logistics quote ready";
  if (status === "vehicle_assigned") return "Heavy logistics vehicle assigned";
  if (status === "completed") return "Heavy logistics completed";
  return `Heavy logistics: ${status.replaceAll("_", " ")}`;
}
