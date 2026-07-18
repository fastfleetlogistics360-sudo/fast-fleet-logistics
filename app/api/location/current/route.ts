import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const runtime = "nodejs";

type LocationPayload = {
  address?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  source?: string;
  mode?: "user" | "rider";
  deliveryId?: string;
  deliveryStatus?: string;
  zone?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as LocationPayload;
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const accuracy = payload.accuracy == null ? null : Number(payload.accuracy);

    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) {
      return NextResponse.json({ error: "Location accuracy must be a positive number." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, saved: false, reason: "signed_out" });
    const limited = await enforceRateLimit(request, rateLimitPolicies.liveLocationUpdate);
    if (limited) return limited;

    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Secure location updates are temporarily unavailable." }, { status: 503 });
    if (payload.mode === "rider") {
      return saveRiderLocation({
        db,
        userId: user.id,
        latitude,
        longitude,
        heading: optionalNumber(payload.heading),
        speed: optionalNumber(payload.speed),
        zone: clean(payload.zone, 120) || "Lagos",
        deliveryId: clean(payload.deliveryId, 80),
        deliveryStatus: clean(payload.deliveryStatus, 60)
      });
    }

    const now = new Date().toISOString();
    const { error } = await db.from("user_locations").upsert(
      {
        user_id: user.id,
        address: clean(payload.address, 500) || null,
        latitude,
        longitude,
        accuracy,
        source: clean(payload.source, 40) || "foreground",
        updated_at: now
      },
      { onConflict: "user_id" }
    );

    if (error) {
      if (isMissingUserLocationsTable(error)) {
        return NextResponse.json({ ok: true, saved: false, reason: "migration_pending" });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, saved: true });
  } catch {
    return NextResponse.json({ error: "Could not save current location." }, { status: 500 });
  }
}

async function saveRiderLocation(input: {
  db: NonNullable<ReturnType<typeof createAdminClient>>;
  userId: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  zone: string;
  deliveryId: string;
  deliveryStatus: string;
}) {
  const { data: rider, error: riderError } = await input.db
    .from("rider_profiles")
    .select("id")
    .eq("user_id", input.userId)
    .maybeSingle<{ id: string }>();
  if (riderError) throw riderError;
  if (!rider?.id) return NextResponse.json({ error: "Rider profile not found." }, { status: 404 });

  const now = new Date().toISOString();
  const riderLocation = await input.db.from("rider_locations").upsert(
    {
      rider_profile_id: rider.id,
      zone: input.zone,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speed: input.speed,
      updated_at: now
    },
    { onConflict: "rider_profile_id" }
  );
  if (riderLocation.error) throw riderLocation.error;

  if (!input.deliveryId) return NextResponse.json({ ok: true, saved: true, mode: "rider" });
  const { data: delivery, error: deliveryError } = await input.db
    .from("deliveries")
    .select("id, rider_id, status")
    .eq("id", input.deliveryId)
    .maybeSingle<{ id: string; rider_id?: string | null; status?: string | null }>();
  if (deliveryError) throw deliveryError;
  if (!delivery?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
  if (delivery.rider_id !== rider.id) return NextResponse.json({ error: "Only the assigned rider can share this delivery location." }, { status: 403 });
  if (["delivered", "cancelled"].includes(String(delivery.status))) {
    return NextResponse.json({ error: "Location sharing is unavailable for this completed delivery." }, { status: 409 });
  }

  const deliveryLocation = await input.db.from("delivery_locations").upsert(
    {
      order_id: delivery.id,
      rider_id: rider.id,
      latitude: input.latitude,
      longitude: input.longitude,
      heading: input.heading,
      speed: input.speed,
      status: allowedDeliveryLocationStatus(input.deliveryStatus, delivery.status),
      updated_at: now
    },
    { onConflict: "order_id" }
  );
  if (deliveryLocation.error) throw deliveryLocation.error;
  return NextResponse.json({ ok: true, saved: true, mode: "rider", deliveryId: delivery.id });
}

function allowedDeliveryLocationStatus(requested: string, current: string | null | undefined) {
  const valid = new Set(["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"]);
  return valid.has(requested) ? requested : valid.has(String(current)) ? String(current) : "active";
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function optionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingUserLocationsTable(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("user_locations") && (message.includes("does not exist") || message.includes("schema cache"));
}
