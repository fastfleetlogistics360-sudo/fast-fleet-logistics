import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DeliveryStatus } from "@/types/domain";

const statusFlow: Record<string, DeliveryStatus> = {
  accepted: "rider_arrived",
  rider_arrived: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered"
};

const jobSelect =
  "id, delivery_code, pickup_address, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email)";

type JobRow = {
  id: string;
  metadata?: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const includeAvailable = requestUrl.searchParams.get("includeAvailable") !== "0";
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const admin = createAdminClient();
    const db = admin || supabase;
    let { data: rider, error: riderError } = await db
      .from("rider_profiles")
      .select("id, vehicle_type, online, application_status")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; vehicle_type?: string | null; online?: boolean | null; application_status?: string | null }>();
    if (riderError) throw riderError;
    if (!rider?.id && admin) {
      rider = await ensureApprovedRiderProfile(admin, user.id);
    }
    if (!rider?.id) return NextResponse.json({ jobs: [] });

    const dispatchVehicle = normalizeDispatchVehicle(rider.vehicle_type) || "bike";
    if (rider.application_status === "approved" && (!rider.online || rider.vehicle_type !== dispatchVehicle)) {
      await db.from("rider_profiles").update({ online: true, vehicle_type: dispatchVehicle }).eq("id", rider.id);
      rider = { ...rider, online: true, vehicle_type: dispatchVehicle };
    }
    const [assignedResult, availableResult] = await Promise.all([
      db.from("deliveries").select(jobSelect).eq("rider_id", rider.id).order("created_at", { ascending: false }).limit(40),
      includeAvailable && rider.online && rider.application_status === "approved"
        ? db
            .from("deliveries")
            .select(jobSelect)
            .eq("status", "searching")
            .is("rider_id", null)
            .eq("vehicle_type", dispatchVehicle)
            .order("created_at", { ascending: true })
            .limit(20)
        : Promise.resolve({ data: [] })
    ]);

    if (assignedResult.error) throw assignedResult.error;
    if ("error" in availableResult && availableResult.error) throw availableResult.error;

    const assigned = ((assignedResult.data || []) as JobRow[]).filter(Boolean);
    const available = (((availableResult as { data?: JobRow[] }).data || []) as JobRow[]).filter((job) => !isRejectedByRider(job, rider.id));
    return NextResponse.json({ jobs: mergeJobs([...available, ...assigned]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load rider jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    if (!id || !["accept", "decline", "advance"].includes(action)) {
      return NextResponse.json({ error: "Choose a job and valid rider action." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    if (action === "accept") {
      const { error } = await supabase.rpc("accept_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      return updateResponse(supabase, id);
    }

    if (action === "decline") {
      const { error } = await supabase.rpc("reject_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      return NextResponse.json({ ok: true, declined: id });
    }

    const { data: current, error: currentError } = await supabase
      .from("deliveries")
	    .select("id, status, rider_profiles(user_id)")
      .eq("id", id)
      .single();
    if (currentError) throw currentError;

    const riderProfiles = current.rider_profiles as { user_id?: string | null } | null;
    if (riderProfiles?.user_id !== user.id) {
      return NextResponse.json({ error: "Only the assigned rider can update this delivery." }, { status: 403 });
    }

    const nextStatus = statusFlow[String(current.status)] || "delivered";
    const timestamp = new Date().toISOString();
    const patch: Record<string, unknown> = { status: nextStatus, updated_at: timestamp };
    if (nextStatus === "picked_up") patch.picked_up_at = timestamp;
    if (nextStatus === "delivered") patch.delivered_at = timestamp;

    const { error: updateError } = await supabase.from("deliveries").update(patch).eq("id", id);
    if (updateError) throw updateError;

    await supabase.from("delivery_events").insert({
      delivery_id: id,
      actor_id: user.id,
      status: nextStatus,
      title: nextStatus.replaceAll("_", " "),
      body: "Rider updated this delivery."
    });
    await supabase.from("delivery_locations").update({ status: nextStatus, updated_at: timestamp }).eq("order_id", id);

    return updateResponse(supabase, id);
	  } catch (error) {
	    const message = error instanceof Error ? error.message : "Could not update rider job.";
	    return NextResponse.json({ error: message }, { status: message.includes("accepted by another rider") ? 409 : 500 });
	  }
	}

async function updateResponse(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, delivery_code, pickup_address, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email)")
    .eq("id", id)
    .single();
  if (error) throw error;
  return NextResponse.json({ job: data });
}

function normalizeDispatchVehicle(vehicleType: string | null | undefined) {
  if (vehicleType === "car" || vehicleType === "van" || vehicleType === "bike") return vehicleType;
  if (vehicleType === "motorcycle" || vehicleType === "tricycle") return "bike";
  return null;
}

async function ensureApprovedRiderProfile(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data: application } = await admin
    .from("rider_applications")
    .select("user_id, status, lga, vehicle_type, vehicle_make, vehicle_model, vehicle_year, plate_number, vehicle_color, bank_name, bank_code, account_number, account_name")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      user_id: string;
      status: string;
      lga?: string | null;
      vehicle_type?: string | null;
      vehicle_make?: string | null;
      vehicle_model?: string | null;
      vehicle_year?: number | null;
      plate_number?: string | null;
      vehicle_color?: string | null;
      bank_name?: string | null;
      bank_code?: string | null;
      account_number?: string | null;
      account_name?: string | null;
    }>();

  if (!application) return null;
  const vehicleType = normalizeDispatchVehicle(application.vehicle_type) || "bike";
  const { data } = await admin
    .from("rider_profiles")
    .upsert(
      {
        user_id: application.user_id,
        application_status: "approved",
        address: application.lga || null,
        operating_zone: application.lga || null,
        vehicle_type: vehicleType,
        vehicle_make: application.vehicle_make || null,
        vehicle_model: application.vehicle_model || null,
        vehicle_year: application.vehicle_year || null,
        plate_number: application.plate_number || null,
        vehicle_color: application.vehicle_color || null,
        bank_name: application.bank_name || null,
        bank_code: application.bank_code || null,
        account_number: application.account_number || null,
        account_name: application.account_name || null,
        online: true,
        reviewed_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("id, vehicle_type, online, application_status")
    .maybeSingle<{ id: string; vehicle_type?: string | null; online?: boolean | null; application_status?: string | null }>();

  return data || null;
}

function isRejectedByRider(job: JobRow, riderId: string | null | undefined) {
  const rejectedIds = job.metadata?.rejected_rider_ids;
  return Boolean(riderId && Array.isArray(rejectedIds) && rejectedIds.includes(riderId));
}

function mergeJobs(jobs: JobRow[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}
