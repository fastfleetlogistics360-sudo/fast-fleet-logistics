import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const activeStatuses = ["searching", "accepted", "rider_arrived", "picked_up", "in_transit"];

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
  rider_profiles?: {
    plate_number?: string | null;
    vehicle_type?: string | null;
    vehicle_color?: string | null;
    users?: {
      full_name?: string | null;
      phone?: string | null;
      email?: string | null;
    } | null;
  } | null;
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
	      "id, rider_id, delivery_code, pickup_address, dropoff_address, status, vehicle_type, delivery_speed, price_ngn, eta_minutes, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, users:users!rider_profiles_user_id_fkey(full_name, phone, email))"
	    )
    .eq("delivery_code", code)
    .in("status", activeStatuses)
    .maybeSingle<DeliveryRow>();

  if (error) {
    return NextResponse.json({ error: "We could not check that tracking code right now." }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "No ongoing delivery was found for that tracking code." }, { status: 404 });
  }

  let lastLocation: { latitude: number; longitude: number; updated_at?: string | null } | null = null;

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
	      rider: {
	        full_name: data.rider_profiles?.users?.full_name || null,
	        phone: data.rider_profiles?.users?.phone || null,
	        email: data.rider_profiles?.users?.email || null,
	        vehicle_type: data.rider_profiles?.vehicle_type || null,
	        plate_number: data.rider_profiles?.plate_number || null,
	        vehicle_color: data.rider_profiles?.vehicle_color || null
	      },
      last_location: lastLocation
    }
  });
}
