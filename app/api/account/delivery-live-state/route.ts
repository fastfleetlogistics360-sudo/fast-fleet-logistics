import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { normalizeRiderAccountType, type RiderAccountType } from "@/lib/rider-account-type";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type DeliveryRow = {
  id: string;
  customer_id?: string | null;
  delivery_code: string;
  pickup_address?: string | null;
  dropoff_address?: string | null;
  status?: string | null;
  price_ngn?: number | string | null;
  eta_minutes?: number | string | null;
  updated_at?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_id?: string | null;
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

/**
 * Private companion to the public tracking endpoint. Messenger needs the
 * FastConfirm metadata, but that state (and its private proof file) must not
 * be exposed to anyone who only knows a public tracking code.
 */
export async function GET(request: Request) {
  const deliveryId = new URL(request.url).searchParams.get("deliveryId")?.trim() || "";
  if (!isUuid(deliveryId)) return noStoreJson({ error: "Choose a valid delivery." }, 400);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return noStoreJson({ error: "Please sign in to refresh this delivery." }, 401);

  const limited = await enforceRateLimit(request, rateLimitPolicies.deliveryConfirmationRead);
  if (limited) return limited;

  const db = createAdminClient();
  if (!db) return noStoreJson({ error: "Delivery updates are temporarily unavailable." }, 503);

  const { data: delivery, error } = await db
    .from("deliveries")
    .select(
      "id, customer_id, delivery_code, pickup_address, dropoff_address, status, price_ngn, eta_minutes, updated_at, metadata, rider_id, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id, plate_number, vehicle_type, vehicle_color, rider_account_type, users:users!rider_profiles_user_id_fkey(full_name, phone, email, avatar_url))"
    )
    .eq("id", deliveryId)
    .maybeSingle<DeliveryRow>();
  if (error) return noStoreJson({ error: "Could not refresh this delivery." }, 500);
  if (!delivery?.id || delivery.customer_id !== user.id) return noStoreJson({ error: "Delivery not found." }, 404);

  const { data: location } = await db
    .from("delivery_locations")
    .select("latitude, longitude, heading, speed, status, updated_at")
    .eq("order_id", delivery.id)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ latitude?: number | string | null; longitude?: number | string | null; heading?: number | string | null; speed?: number | string | null; status?: string | null; updated_at?: string | null }>();

  return noStoreJson({
    delivery: {
      id: delivery.id,
      delivery_code: delivery.delivery_code,
      pickup_address: delivery.pickup_address || "",
      dropoff_address: delivery.dropoff_address || "",
      status: delivery.status || "pending",
      price_ngn: Number(delivery.price_ngn || 0),
      eta_minutes: Number(delivery.eta_minutes || 0),
      updated_at: delivery.updated_at || null,
      // This response is authenticated and ownership-checked. It is never
      // returned by /api/tracking, which remains safe for public tracking.
      metadata: delivery.metadata || null,
      rider_id: delivery.rider_id || null,
      rider: {
        full_name: delivery.rider_profiles?.users?.full_name || null,
        phone: delivery.rider_profiles?.users?.phone || null,
        email: delivery.rider_profiles?.users?.email || null,
        avatar_url: delivery.rider_profiles?.users?.avatar_url || null,
        vehicle_type: delivery.rider_profiles?.vehicle_type || null,
        plate_number: delivery.rider_profiles?.plate_number || null,
        vehicle_color: delivery.rider_profiles?.vehicle_color || null,
        rider_account_type: normalizeRiderAccountType(delivery.rider_profiles?.rider_account_type)
      },
      last_location:
        location?.latitude != null && location.longitude != null
          ? {
              latitude: Number(location.latitude),
              longitude: Number(location.longitude),
              heading: location.heading == null ? null : Number(location.heading),
              speed: location.speed == null ? null : Number(location.speed),
              status: location.status || null,
              updated_at: location.updated_at || null
            }
          : null
    }
  });
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
