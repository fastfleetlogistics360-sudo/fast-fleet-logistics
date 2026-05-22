import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DeliveryStatus } from "@/types/domain";

const deliveryStatuses = new Set(["pending_payment", "searching", "accepted", "rider_arrived", "picked_up", "in_transit", "delivered", "cancelled"]);

const demoDeliveries = [
  {
    id: "DLV-1001",
    delivery_code: "FF-DEMO-1001",
    pickup_address: "Victoria Island, Lagos",
    dropoff_address: "Ikeja GRA, Lagos",
    status: "in_transit",
    price_ngn: 10850,
    eta_minutes: 22,
    created_at: new Date().toISOString(),
    users: { full_name: "Demo Customer", phone: "+2348000000000", email: "customer@example.com" },
    rider_profiles: { users: { full_name: "Tunde Adebayo", phone: "+2348012204410" } }
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ deliveries: demoDeliveries, demo: true });

  const { data, error } = await supabase
    .from("deliveries")
    .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, eta_minutes, created_at, users(full_name, phone, email), rider_profiles(users(full_name, phone, email))")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ deliveries: data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  if (!id || !deliveryStatuses.has(status)) {
    return NextResponse.json({ error: "Choose a delivery and a valid timeline status." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to update delivery timelines." }, { status: 503 });

  const timestamp = new Date().toISOString();
  const patch: { status: DeliveryStatus; accepted_at?: string; picked_up_at?: string; delivered_at?: string; metadata?: Record<string, string> } = {
    status: status as DeliveryStatus,
    metadata: { admin_timeline_updated_at: timestamp }
  };
  if (status === "accepted") patch.accepted_at = timestamp;
  if (status === "picked_up" || status === "in_transit") patch.picked_up_at = timestamp;
  if (status === "delivered") patch.delivered_at = timestamp;

  const { data, error } = await supabase
    .from("deliveries")
    .update(patch)
    .eq("id", id)
    .select("id, customer_id, rider_profiles(user_id), delivery_code, status, accepted_at, picked_up_at, delivered_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from("delivery_events").insert({
    delivery_id: id,
    status: status as DeliveryStatus,
    title: status.replaceAll("_", " "),
    body: "Admin updated this customer delivery timeline."
  });

  const riderProfiles = data.rider_profiles as { user_id?: string | null } | null;
  await Promise.allSettled([
    supabase.from("notifications").insert({
      user_id: data.customer_id,
      title: status === "delivered" ? "Delivery completed" : "Delivery updated",
      body: `${data.delivery_code} is now ${status.replaceAll("_", " ")}.`,
      type: status === "delivered" ? "delivery_completed" : "delivery_update",
      channel: "in_app",
      metadata: { delivery_id: data.id, delivery_code: data.delivery_code, status }
    }),
    riderProfiles?.user_id
      ? supabase.from("notifications").insert({
          user_id: riderProfiles.user_id,
          title: "Delivery timeline updated",
          body: `${data.delivery_code} is now ${status.replaceAll("_", " ")}.`,
          type: "delivery_update",
          channel: "in_app",
          metadata: { delivery_id: data.id, delivery_code: data.delivery_code, status }
        })
      : Promise.resolve()
  ]);

  return NextResponse.json({ delivery: data });
}
