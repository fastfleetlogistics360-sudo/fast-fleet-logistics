import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { RiderAccountType } from "@/lib/rider-account-type";
import { LiveOrderTracking, type DeliveryLocation, type TrackingOrder } from "@/components/tracking/live-order-tracking";

export const metadata: Metadata = {
  title: "Track Order"
};

export const dynamic = "force-dynamic";

type DeliveryRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  dropoff_address: string;
  dropoff_latitude?: number | null;
  dropoff_longitude?: number | null;
  status: string;
  price_ngn: number;
  distance_km?: number | null;
  eta_minutes?: number | null;
  created_at: string;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_id?: string | null;
    rider_profiles?: {
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

type RiderProfileRow = NonNullable<DeliveryRow["rider_profiles"]>;

export default async function TrackOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect(`/auth?returnTo=/account/orders/${encodeURIComponent(orderId)}/track`);

  const query = supabase
    .from("deliveries")
    .select(
      "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, dropoff_address, dropoff_latitude, dropoff_longitude, status, price_ngn, distance_km, eta_minutes, created_at, updated_at, metadata, rider_id, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))"
    )
    .eq("customer_id", user.id);

  const result = isUuid(orderId)
    ? await query.eq("id", orderId).maybeSingle<DeliveryRow>()
    : await query.eq("delivery_code", orderId.toUpperCase()).maybeSingle<DeliveryRow>();

  if (result.error || !result.data) notFound();

  let riderProfile = result.data.rider_profiles;
  if (result.data.rider_id && !riderProfile?.users?.full_name) {
    const admin = createAdminClient();
    if (admin) {
      const { data } = await admin
        .from("rider_profiles")
        .select("plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url)")
        .eq("id", result.data.rider_id)
        .maybeSingle<RiderProfileRow>();
      riderProfile = data || riderProfile;
    }
  }

  const { data: location } = await supabase
    .from("delivery_locations")
    .select("id, order_id, rider_id, latitude, longitude, heading, speed, status, created_at, updated_at")
    .eq("order_id", result.data.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<DeliveryLocation>();

  const order: TrackingOrder = {
    id: result.data.id,
    delivery_code: result.data.delivery_code,
    pickup_address: result.data.pickup_address,
    pickup_latitude: result.data.pickup_latitude,
    pickup_longitude: result.data.pickup_longitude,
    dropoff_address: result.data.dropoff_address,
    dropoff_latitude: result.data.dropoff_latitude,
    dropoff_longitude: result.data.dropoff_longitude,
    status: result.data.status,
    price_ngn: Number(result.data.price_ngn || 0),
    distance_km: result.data.distance_km == null ? null : Number(result.data.distance_km),
    eta_minutes: result.data.eta_minutes == null ? null : Number(result.data.eta_minutes),
    created_at: result.data.created_at,
    updated_at: result.data.updated_at,
    metadata: result.data.metadata || null,
    rider_id: result.data.rider_id,
    rider: {
      full_name: riderProfile?.users?.full_name || null,
      phone: riderProfile?.users?.phone || null,
      email: riderProfile?.users?.email || null,
      avatar_url: riderProfile?.users?.avatar_url || null,
      vehicle_type: riderProfile?.vehicle_type || null,
      plate_number: riderProfile?.plate_number || null,
      vehicle_color: riderProfile?.vehicle_color || null,
      rider_account_type: riderProfile?.rider_account_type || null
    }
  };

  return <LiveOrderTracking initialOrder={order} initialLocation={location || null} />;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
