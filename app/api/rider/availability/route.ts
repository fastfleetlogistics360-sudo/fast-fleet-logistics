import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const activeDeliveryStatuses = ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"];
const riderProfileSelect =
  "id, user_id, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, rating, completed_deliveries, online, application_status, rider_account_type, operating_zone";

type RiderProfileRow = {
  id: string;
  user_id: string;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  rating?: number | null;
  completed_deliveries?: number | null;
  online?: boolean | null;
  application_status?: string | null;
  rider_account_type?: string | null;
  operating_zone?: string | null;
};

type RiderApplicationRow = {
  user_id: string;
  status?: string | null;
  lga?: string | null;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  return handleAvailability(requestUrl.searchParams.get("vehicleType"));
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { online?: unknown; vehicleType?: unknown };
  return handleAvailability(body.vehicleType, typeof body.online === "boolean" ? body.online : undefined, request);
}

async function handleAvailability(rawVehicleType: unknown, requestedOnline?: boolean, mutationRequest?: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to update rider availability." }, { status: 401 });
    if (mutationRequest) {
      const limited = await enforceRateLimit(mutationRequest, rateLimitPolicies.riderAvailability);
      if (limited) return limited;
    }

    const admin = createAdminClient();
    const db = (admin || supabase) as SupabaseClient;
    let profile = await loadRiderProfile(db, user.id);
    const application = await loadLatestRiderApplication(db, user.id);

    if (!profile && admin && application?.status === "approved") {
      profile = await createProfileFromApplication(admin, application, rawVehicleType, requestedOnline);
    }
    if (!profile?.id) {
      return NextResponse.json({ error: "Your approved rider profile was not found. Please contact support." }, { status: 404 });
    }

    const promotedFromApplication = Boolean(admin && application?.status === "approved" && profile.application_status !== "approved");
    const dispatchVehicle = normalizeDispatchVehicle(rawVehicleType || profile.vehicle_type || application?.vehicle_type) || "bike";
    const patch: Record<string, unknown> = {};

    if (promotedFromApplication) patch.application_status = "approved";
    if (profile.vehicle_type !== dispatchVehicle) patch.vehicle_type = dispatchVehicle;

    const approved = promotedFromApplication || profile.application_status === "approved";
    if (typeof requestedOnline === "boolean") {
      if (!approved) {
        return NextResponse.json({ error: "Your rider KYC must be approved before going online." }, { status: 403 });
      }
      if (!requestedOnline && (await hasActiveDelivery(db, profile.id))) {
        return NextResponse.json({ error: "You can't go offline until the dispatch job has been delivered." }, { status: 409 });
      }
      patch.online = requestedOnline;
    }

    if (Object.keys(patch).length) {
      const { data, error } = await db
        .from("rider_profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", profile.id)
        .select(riderProfileSelect)
        .maybeSingle<RiderProfileRow>();
      if (error) throw error;
      profile = data || { ...profile, ...patch };
    }

    return NextResponse.json({
      profile: {
        ...profile,
        vehicle_type: normalizeDispatchVehicle(profile.vehicle_type) || dispatchVehicle,
        online: Boolean(profile.online),
        application_status: promotedFromApplication ? "approved" : profile.application_status
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update rider availability." }, { status: 500 });
  }
}

async function loadRiderProfile(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("rider_profiles")
    .select(riderProfileSelect)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RiderProfileRow>();
  if (error) throw error;
  return data || null;
}

async function loadLatestRiderApplication(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("rider_applications")
    .select("user_id, status, lga, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<RiderApplicationRow>();
  if (error) throw error;
  return data || null;
}

async function createProfileFromApplication(db: SupabaseClient, application: RiderApplicationRow, rawVehicleType: unknown, requestedOnline?: boolean) {
  const vehicleType = normalizeDispatchVehicle(rawVehicleType || application.vehicle_type) || "bike";
  const { data, error } = await db
    .from("rider_profiles")
    .upsert(
      {
        user_id: application.user_id,
        application_status: "approved",
        rider_account_type: "independent",
        address: application.lga || null,
        operating_zone: application.lga || null,
        vehicle_type: vehicleType,
        plate_number: application.plate_number || null,
        vehicle_color: application.vehicle_color || null,
        bank_name: application.bank_name || null,
        account_number: application.account_number || null,
        account_name: application.account_name || null,
        online: Boolean(requestedOnline),
        reviewed_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select(riderProfileSelect)
    .maybeSingle<RiderProfileRow>();
  if (error) throw error;
  return data || null;
}

async function hasActiveDelivery(db: SupabaseClient, riderProfileId: string) {
  const { data, error } = await db
    .from("deliveries")
    .select("id")
    .eq("rider_id", riderProfileId)
    .in("status", activeDeliveryStatuses)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

function normalizeDispatchVehicle(vehicleType: unknown) {
  const value = String(vehicleType || "").toLowerCase();
  if (value === "car" || value === "van" || value === "bike") return value;
  if (value === "motorcycle" || value === "tricycle") return "bike";
  return null;
}
