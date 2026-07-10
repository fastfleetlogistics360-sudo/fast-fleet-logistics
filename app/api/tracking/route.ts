import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRiderAccountType, type RiderAccountType } from "@/lib/rider-account-type";

type DeliveryRow = {
  id: string;
  delivery_code: string;
  rider_id?: string | null;
  pickup_address: string;
  dropoff_address: string;
  status: string;
  vehicle_type: string;
  delivery_speed: string;
  price_ngn: number | string;
  eta_minutes: number | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_profiles?: {
    user_id?: string | null;
    plate_number?: string | null;
    vehicle_type?: string | null;
    vehicle_color?: string | null;
    rider_account_type?: RiderAccountType | null;
    users?: {
      full_name?: string | null;
      phone?: string | null;
      email?: string | null;
      avatar_url?: string | null;
    } | null;
  } | null;
};

type OrderRow = {
  id: string;
  order_code?: string | null;
  delivery_id?: string | null;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  status?: string | null;
  vehicle_type?: string | null;
  amount?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toUpperCase() || "";

  if (!code) {
    return NextResponse.json({ error: "Enter a tracking code." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Tracking is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("deliveries")
    .select(
      "id, rider_id, delivery_code, pickup_address, dropoff_address, status, vehicle_type, delivery_speed, price_ngn, eta_minutes, created_at, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id, plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))"
    )
    .eq("delivery_code", code)
    .maybeSingle<DeliveryRow>();

  if (error) {
    return NextResponse.json({ error: "We could not check that tracking code right now." }, { status: 400 });
  }

  if (!data) {
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id, order_code, delivery_id, pickup_address, dropoff_address, status, vehicle_type, amount, created_at, updated_at")
      .eq("order_code", code)
      .maybeSingle<OrderRow>();
    if (orderError) return NextResponse.json({ error: "We could not check that tracking code right now." }, { status: 400 });
    if (!order?.id) return NextResponse.json({ error: "No delivery or marketplace order was found for that tracking code." }, { status: 404 });

    return orderTrackingResponse(order, code);
  }

  const { data: marketplaceOrder } = await supabase
    .from("orders")
    .select("id, order_code, delivery_id, pickup_address, dropoff_address, status, vehicle_type, amount, created_at, updated_at")
    .eq("order_code", code)
    .maybeSingle<OrderRow>();
  if (marketplaceOrder?.id && shouldShowMarketplaceOrderBeforeDelivery(marketplaceOrder, data)) {
    return orderTrackingResponse(marketplaceOrder, code);
  }

  let lastLocation: { latitude: number; longitude: number; updated_at?: string | null } | null = null;
  let profileFallback: { full_name?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null } | null = null;

	  if (data.rider_id) {
	    const { data: location } = await supabase
	      .from("delivery_locations")
	      .select("latitude, longitude, updated_at")
	      .eq("order_id", data.id)
	      .order("updated_at", { ascending: false })
	      .limit(1)
	      .maybeSingle<{ latitude: number | string; longitude: number | string; updated_at?: string | null }>();

    if (location?.latitude && location?.longitude) {
      lastLocation = {
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        updated_at: location.updated_at || null
      };
    }
  }

  if (data.rider_profiles?.user_id && (!data.rider_profiles.users?.full_name || !data.rider_profiles.users?.avatar_url)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, email, avatar_url")
      .eq("user_id", data.rider_profiles.user_id)
      .maybeSingle<{ full_name?: string | null; phone?: string | null; email?: string | null; avatar_url?: string | null }>();
    profileFallback = profile || null;
  }

  return NextResponse.json({
    delivery: {
      id: data.id,
      delivery_code: data.delivery_code,
      pickup_address: data.pickup_address,
      dropoff_address: data.dropoff_address,
      status: data.status,
      vehicle_type: data.vehicle_type,
      delivery_speed: data.delivery_speed,
      price_ngn: Number(data.price_ngn || 0),
      eta_minutes: data.eta_minutes || 0,
      created_at: data.created_at || null,
      metadata: data.metadata || null,
      rider: {
        full_name: data.rider_profiles?.users?.full_name || profileFallback?.full_name || null,
        phone: data.rider_profiles?.users?.phone || profileFallback?.phone || null,
        email: data.rider_profiles?.users?.email || profileFallback?.email || null,
        avatar_url: data.rider_profiles?.users?.avatar_url || profileFallback?.avatar_url || null,
        vehicle_type: data.rider_profiles?.vehicle_type || null,
        plate_number: data.rider_profiles?.plate_number || null,
        vehicle_color: data.rider_profiles?.vehicle_color || null,
        rider_account_type: normalizeRiderAccountType(data.rider_profiles?.rider_account_type)
      },
      last_location: lastLocation
    }
  });
}

function orderTrackingResponse(order: OrderRow, code: string) {
  return NextResponse.json({
    delivery: {
      id: order.delivery_id || order.id,
      delivery_code: order.order_code || code,
      pickup_address: order.pickup_address || "Marketplace pickup",
      dropoff_address: order.dropoff_address || "Customer delivery address",
      status: order.status || "received",
      vehicle_type: normalizeVehicle(order.vehicle_type),
      delivery_speed: "same_day",
      price_ngn: Number(order.amount || 0),
      eta_minutes: 0,
      created_at: order.created_at || null,
      rider: {
        full_name: null,
        phone: null,
        email: null,
        avatar_url: null,
        vehicle_type: null,
        plate_number: null,
        vehicle_color: null,
        rider_account_type: normalizeRiderAccountType(null)
      },
      last_location: null
    }
  });
}

function shouldShowMarketplaceOrderBeforeDelivery(order: OrderRow, delivery: DeliveryRow) {
  if (delivery.status === "cancelled") return true;
  if (!order.delivery_id) return true;
  return ["pending", "received", "preparing", "packing", "ready_for_pickup"].includes(String(order.status || ""));
}

function normalizeVehicle(value: unknown) {
  const vehicle = String(value || "").toLowerCase();
  return vehicle === "car" || vehicle === "van" ? vehicle : "bike";
}
