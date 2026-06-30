import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { estimateMarketplaceCheckout } from "@/lib/marketplace-pricing";
import { normalizeState } from "@/lib/launch-states";
import { extractNigerianState, pickupMatchesRiderState } from "@/lib/location/state-matching";
import { repairMarketplaceDeliveriesForBusiness } from "@/lib/marketplace-order-repair";
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

    const admin = createAdminClient();
    const db = admin || supabase;
    const { data: businessProfile, error: businessError } = await db
      .from("business_profiles")
      .select("id, registration_status")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; registration_status?: string | null }>();
    if (businessError) throw businessError;
    if (businessProfile?.registration_status !== "active") return NextResponse.json({ orders: [] });
    if (admin) await repairMarketplaceDeliveriesForBusiness(admin, businessProfile.id);

    const { data, error } = await db
      .from("orders")
      .select(orderSelect)
      .or(`business_profile_id.eq.${businessProfile.id},business_id.eq.${user.id}`)
      .neq("payment_status", "pending")
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
    let { data: businessProfile, error: businessError } = await db
      .from("business_profiles")
      .select("id, user_id, business_name, pickup_address, operating_state, registration_status, users:users!business_profiles_user_id_fkey(default_zone)")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; user_id: string; business_name?: string | null; pickup_address?: string | null; operating_state?: string | null; registration_status?: string | null; users?: { default_zone?: string | null } | null }>();
    if (businessError) {
      const fallback = await db
        .from("business_profiles")
        .select("id, user_id, business_name, pickup_address, registration_status, users:users!business_profiles_user_id_fkey(default_zone)")
        .eq("user_id", user.id)
        .maybeSingle<{ id: string; user_id: string; business_name?: string | null; pickup_address?: string | null; registration_status?: string | null; users?: { default_zone?: string | null } | null }>();
      businessProfile = fallback.data ? { ...fallback.data, operating_state: null } : null;
      businessError = fallback.error;
    }
    if (businessError) throw businessError;
    if (businessProfile?.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before managing orders." }, { status: 403 });
    }
    const businessState = normalizeState(businessProfile.operating_state || businessProfile.users?.default_zone);
    if (status === "ready_for_pickup" && !businessState) {
      return NextResponse.json({ error: "Select and save your business state from Account before marking orders ready for pickup." }, { status: 400 });
    }

    const { data: order, error: orderError } = await db
      .from("orders")
      .select(orderSelect)
      .eq("id", id)
      .or(`business_profile_id.eq.${businessProfile.id},business_id.eq.${user.id}`)
      .single<Record<string, unknown>>();
    if (orderError) throw orderError;

    const nextPatch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    let deliveryId = typeof order.delivery_id === "string" ? order.delivery_id : null;
    const businessPickupAddress = appendStateToAddress(businessProfile.pickup_address || String(order.pickup_address || "Business pickup"), businessState);
    const customerDropoffAddress = String(order.dropoff_address || "");
    const businessPickupContact = businessProfile.business_name || "Business pickup";
    const marketplaceCustomerContact = String(order.customer_contact || "Marketplace customer");
    const marketplaceEstimate = estimateBusinessOrderDelivery(order);

    if (status === "ready_for_pickup" && !deliveryId) {
      const deliveryCode = String(order.order_code || `FF-BIZ-ORDER-${Date.now().toString(36).toUpperCase()}`);
      const { data: delivery, error: deliveryError } = await db
        .from("deliveries")
        .insert({
          delivery_code: deliveryCode,
          customer_id: businessProfile.user_id,
          pickup_address: businessPickupAddress,
          pickup_contact: businessPickupContact,
          dropoff_address: customerDropoffAddress,
          dropoff_contact: marketplaceCustomerContact,
          parcel_type: order.package_type || "Marketplace order",
          vehicle_type: normalizeVehicle(order.vehicle_type),
          delivery_speed: "same_day",
          payment_method: "card",
          status: "searching",
          price_ngn: marketplaceEstimate.deliveryFee,
          distance_km: marketplaceEstimate.distanceKm,
          eta_minutes: marketplaceEstimate.etaMinutes,
          metadata: {
            source: "business_marketplace_order",
            business_order_id: order.id,
            business_profile_id: businessProfile.id,
            business_name: businessProfile.business_name || null,
            marketplace_customer_id: order.customer_id || null,
            marketplace_kind: order.marketplace_kind || null,
            order_total_ngn: Number(order.amount || 0),
            goods_amount_ngn: marketplaceEstimate.itemsTotal,
            delivery_fee_ngn: marketplaceEstimate.deliveryFee,
            platform_fee_ngn: marketplaceEstimate.platformFee
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
        notifyApprovedRiders(db, delivery.id, delivery.delivery_code, businessPickupAddress)
      ]);
    } else if (status === "ready_for_pickup" && deliveryId) {
      await db
        .from("deliveries")
        .update({
          customer_id: businessProfile.user_id,
          pickup_address: businessPickupAddress,
          pickup_contact: businessPickupContact,
          dropoff_address: customerDropoffAddress,
          dropoff_contact: marketplaceCustomerContact,
          updated_at: new Date().toISOString()
        })
        .eq("id", deliveryId);
    }

    const { data: updated, error: updateError } = await db
      .from("orders")
      .update(nextPatch)
      .eq("id", id)
      .or(`business_profile_id.eq.${businessProfile.id},business_id.eq.${user.id}`)
      .select(orderSelect)
      .single();
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

function estimateBusinessOrderDelivery(order: Record<string, unknown>) {
  try {
    return estimateMarketplaceCheckout({
      kind: order.marketplace_kind === "shopping" ? "shopping" : "restaurant",
      items: Array.isArray(order.items) ? order.items as Parameters<typeof estimateMarketplaceCheckout>[0]["items"] : [],
      address: String(order.dropoff_address || "")
    });
  } catch {
    const amount = Math.max(0, Math.round(Number(order.amount || 0)));
    return {
      itemsTotal: 0,
      pickupAddress: String(order.pickup_address || "Business pickup"),
      distanceKm: 5,
      etaMinutes: 35,
      deliveryFee: amount,
      platformFee: 0,
      total: amount
    };
  }
}

function normalizeVehicle(value: unknown) {
  const vehicle = String(value || "").toLowerCase();
  return vehicle === "car" || vehicle === "van" ? vehicle : "bike";
}

function appendStateToAddress(address: string, state: string) {
  const normalizedState = normalizeState(state);
  if (!normalizedState) return address;
  return extractNigerianState(address) === normalizedState ? address : `${address}, ${normalizedState}`;
}

async function notifyApprovedRiders(db: SupabaseClient, deliveryId: string, deliveryCode: string, pickupAddress: string) {
  const { data: riders } = await db
    .from("rider_profiles")
    .select("user_id, operating_zone, address")
    .eq("application_status", "approved")
    .eq("online", true)
    .limit(25);

  const rows = (riders || [])
    .filter((rider) => pickupMatchesRiderState(pickupAddress, rider.operating_zone || rider.address))
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
