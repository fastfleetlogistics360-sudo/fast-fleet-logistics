import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const businessProgress = new Set(["received", "preparing", "packing", "ready_for_pickup"]);

const orderSelect =
  "id, order_code, customer_id, business_id, business_profile_id, delivery_id, marketplace_kind, items, customer_contact, pickup_address, dropoff_address, package_type, vehicle_type, status, amount, payment_status, created_at, updated_at, delivered_at";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to load business orders." }, { status: 401 });

    const { data: businessProfile, error: businessError } = await supabase
      .from("business_profiles")
      .select("id, registration_status")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; registration_status?: string | null }>();
    if (businessError) throw businessError;
    if (businessProfile?.registration_status !== "active") return NextResponse.json({ orders: [] });

    const { data, error } = await supabase
      .from("orders")
      .select(orderSelect)
      .eq("business_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) throw error;
    return NextResponse.json({ orders: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load business orders." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { id?: string; status?: string };
    const id = String(payload.id || "").trim();
    const status = String(payload.status || "").trim();
    if (!id || !businessProgress.has(status)) {
      return NextResponse.json({ error: "Choose a valid business order status." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to update business orders." }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Business order dispatch is not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
    }
    const db = admin;
    const { data: businessProfile, error: businessError } = await db
      .from("business_profiles")
      .select("id, user_id, business_name, pickup_address, registration_status")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; user_id: string; business_name?: string | null; pickup_address?: string | null; registration_status?: string | null }>();
    if (businessError) throw businessError;
    if (businessProfile?.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before managing orders." }, { status: 403 });
    }

    const { data: order, error: orderError } = await db
      .from("orders")
      .select(orderSelect)
      .eq("id", id)
      .eq("business_id", user.id)
      .single<Record<string, unknown>>();
    if (orderError) throw orderError;

    const nextPatch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    let deliveryId = typeof order.delivery_id === "string" ? order.delivery_id : null;

    if (status === "ready_for_pickup" && !deliveryId) {
      const deliveryCode = String(order.order_code || `FF-BIZ-ORDER-${Date.now().toString(36).toUpperCase()}`);
      const { data: delivery, error: deliveryError } = await db
        .from("deliveries")
        .insert({
          delivery_code: deliveryCode,
          customer_id: order.customer_id,
          pickup_address: order.pickup_address || businessProfile.pickup_address || "Business pickup",
          pickup_contact: businessProfile.business_name || "Business pickup",
          dropoff_address: order.dropoff_address,
          dropoff_contact: order.customer_contact || "Marketplace customer",
          parcel_type: order.package_type || "Marketplace order",
          vehicle_type: normalizeVehicle(order.vehicle_type),
          delivery_speed: "same_day",
          payment_method: "card",
          status: "searching",
          price_ngn: Number(order.amount || 0),
          distance_km: 5,
          eta_minutes: 35,
          metadata: {
            source: "business_marketplace_order",
            business_order_id: order.id,
            business_profile_id: businessProfile.id,
            business_name: businessProfile.business_name || null,
            marketplace_kind: order.marketplace_kind || null
          }
        })
        .select("id, delivery_code")
        .single<{ id: string; delivery_code: string }>();
      if (deliveryError) throw deliveryError;
      deliveryId = delivery.id;
      nextPatch.delivery_id = delivery.id;

      await Promise.allSettled([
        db.from("delivery_events").insert({
          delivery_id: delivery.id,
          actor_id: user.id,
          status: "searching",
          title: "Ready for pickup",
          body: "Business marked this order ready. Fast Fleets 360 is finding a courier."
        }),
        notifyApprovedRiders(db, delivery.id, delivery.delivery_code)
      ]);
    }

    const { data: updated, error: updateError } = await db.from("orders").update(nextPatch).eq("id", id).eq("business_id", user.id).select(orderSelect).single();
    if (updateError) throw updateError;

    await Promise.allSettled([
      db.from("notifications").insert({
        user_id: order.customer_id,
        title: "Order status updated",
        body: `${String(order.order_code || "Your order")} is ${status.replaceAll("_", " ")}.`,
        type: "order_update",
        channel: "in_app",
        metadata: { order_id: id, delivery_id: deliveryId, status }
      }),
      db.from("notifications").insert({
        user_id: user.id,
        title: status === "ready_for_pickup" ? "Dispatch request sent" : "Business order updated",
        body: `${String(order.order_code || "Order")} is ${status.replaceAll("_", " ")}.`,
        type: "business_order_update",
        channel: "in_app",
        metadata: { order_id: id, delivery_id: deliveryId, status }
      })
    ]);

    return NextResponse.json({ order: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update business order." }, { status: 500 });
  }
}

function normalizeVehicle(value: unknown) {
  const vehicle = String(value || "").toLowerCase();
  return vehicle === "car" || vehicle === "van" ? vehicle : "bike";
}

async function notifyApprovedRiders(db: SupabaseClient, deliveryId: string, deliveryCode: string) {
  const { data: riders } = await db
    .from("rider_profiles")
    .select("user_id")
    .eq("application_status", "approved")
    .eq("online", true)
    .limit(25);

  const rows = (riders || [])
    .map((rider) => rider.user_id)
    .filter(Boolean)
    .map((userId) => ({
      user_id: userId,
      title: "New dispatch request",
      body: `${deliveryCode} is ready for pickup.`,
      type: "dispatch_request",
      channel: "in_app",
      metadata: { delivery_id: deliveryId, delivery_code: deliveryCode }
    }));
  if (rows.length) await db.from("notifications").insert(rows);
}
