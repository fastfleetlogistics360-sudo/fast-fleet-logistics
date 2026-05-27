import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRiderAccountType, type RiderAccountType } from "@/lib/rider-account-type";

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
  created_at?: string | null;
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
	      "id, rider_id, delivery_code, pickup_address, dropoff_address, status, vehicle_type, delivery_speed, price_ngn, eta_minutes, created_at, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id, plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))"
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
