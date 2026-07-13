import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isBicycleDelivery, loadAssignedBicycleAsset, markBicycleAssetBusy, releaseBicycleAssetForDelivery } from "@/lib/fleet-assets";
import { extractNigerianState, pickupMatchesRiderState } from "@/lib/location/state-matching";
import { bicycleCrossStateRouteMaxKm, coordinatePoint, crossStatePickupRadiusKm, haversineKm, isFreshLocation } from "@/lib/location/proximity";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { isCustomerPickupProofRequired, metadataRecord, pickupProofFromMetadata, pickupProofReviewExpired } from "@/lib/pickup-proof";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { accountMessengerHref } from "@/lib/tracking-links";
import type { DeliveryStatus } from "@/types/domain";

const statusFlow: Record<string, DeliveryStatus> = {
  accepted: "rider_arrived",
  rider_arrived: "picked_up",
  picked_up: "in_transit",
  in_transit: "delivered"
};

const jobSelect =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email, avatar_url)";

type JobRow = {
  id: string;
  pickup_address?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  distance_km?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

type RiderLocationRow = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  updated_at?: string | null;
};

type RiderFleetAsset = Awaited<ReturnType<typeof loadAssignedBicycleAsset>>;

export async function GET(request: Request) {
  try {
    const limited = await enforceRateLimit(request, rateLimitPolicies.riderJobsRead);
    if (limited) return limited;

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
      .select("id, vehicle_type, online, application_status, operating_zone, address")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; vehicle_type?: string | null; online?: boolean | null; application_status?: string | null; operating_zone?: string | null; address?: string | null }>();
    if (riderError) throw riderError;
    if (!rider?.id && admin) {
      rider = await ensureApprovedRiderProfile(admin, user.id);
    }
    if (!rider?.id) return NextResponse.json({ jobs: [] });

    const dispatchVehicle = normalizeDispatchVehicle(rider.vehicle_type) || "bike";
    if (rider.application_status === "approved" && rider.vehicle_type !== dispatchVehicle) {
      await db.from("rider_profiles").update({ vehicle_type: dispatchVehicle }).eq("id", rider.id);
      rider = { ...rider, vehicle_type: dispatchVehicle };
    }
    const riderState = extractNigerianState(rider.operating_zone || rider.address);
    const canLoadAvailable = includeAvailable && rider.online && rider.application_status === "approved" && riderState;
    const bicycleAsset = canLoadAvailable ? await loadAssignedBicycleAsset(db, rider.id) : null;
    const riderLocationQuery = canLoadAvailable
      ? db
          .from("rider_locations")
          .select("latitude, longitude, updated_at")
          .eq("rider_profile_id", rider.id)
          .maybeSingle<RiderLocationRow>()
      : Promise.resolve({ data: null });
    const availableByAddressQuery = canLoadAvailable
      ? db
          .from("deliveries")
          .select(jobSelect)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", dispatchVehicle)
          .ilike("pickup_address", `%${riderState}%`)
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] });
    const availableByMetadataQuery = canLoadAvailable
      ? db
          .from("deliveries")
          .select(jobSelect)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", dispatchVehicle)
          .contains("metadata", { pickup_state: riderState })
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] });
    const availableNearbyQuery = canLoadAvailable
      ? db
          .from("deliveries")
          .select(jobSelect)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", dispatchVehicle)
          .order("created_at", { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [] });

    const [assignedResult, availableByAddressResult, availableByMetadataResult, availableNearbyResult, riderLocationResult] = await Promise.all([
      db.from("deliveries").select(jobSelect).eq("rider_id", rider.id).order("created_at", { ascending: false }).limit(40),
      availableByAddressQuery,
      availableByMetadataQuery,
      availableNearbyQuery,
      riderLocationQuery
    ]);

    if (assignedResult.error) throw assignedResult.error;
    if ("error" in availableByAddressResult && availableByAddressResult.error) throw availableByAddressResult.error;
    if ("error" in availableByMetadataResult && availableByMetadataResult.error) throw availableByMetadataResult.error;
    if ("error" in availableNearbyResult && availableNearbyResult.error) throw availableNearbyResult.error;
    if ("error" in riderLocationResult && riderLocationResult.error) throw riderLocationResult.error;

    const assigned = ((assignedResult.data || []) as JobRow[]).filter(Boolean);
    const riderLocation = ((riderLocationResult as { data?: RiderLocationRow | null }).data || null) as RiderLocationRow | null;
    const available = [
      ...(((availableByAddressResult as { data?: JobRow[] }).data || []) as JobRow[]),
      ...(((availableByMetadataResult as { data?: JobRow[] }).data || []) as JobRow[]),
      ...(((availableNearbyResult as { data?: JobRow[] }).data || []) as JobRow[])
    ].filter(
      (job) =>
        !isRejectedByRider(job, rider.id) &&
        jobMatchesRiderDispatch(job, rider.operating_zone || rider.address, bicycleAsset, riderLocation)
    );
    return NextResponse.json({ jobs: mergeJobs([...available, ...assigned]) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load rider jobs." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, rateLimitPolicies.riderJobsWrite);
    if (limited) return limited;

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

    const admin = createAdminClient();
    const db = admin || supabase;

    if (action === "accept") {
      const stateCheck = await canRiderAcceptPickupState(db, user.id, id);
      if (!stateCheck.ok) return NextResponse.json({ error: stateCheck.error }, { status: 403 });
      const { error } = await supabase.rpc("accept_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      if (stateCheck.bicycle) {
        const asset = await markBicycleAssetBusy(db, stateCheck.riderProfileId, id);
        if (asset?.id) await attachFleetAssetToDelivery(db, id, asset.id, asset.asset_code || null);
      }
      await syncLinkedBusinessOrder(db, id, "rider_assigned");
      return updateResponse(db, id);
    }

    if (action === "decline") {
      const { error } = await supabase.rpc("reject_delivery_offer", { target_delivery_id: id });
      if (error) throw error;
      return NextResponse.json({ ok: true, declined: id });
    }

    const { data: rider, error: riderError } = await db
      .from("rider_profiles")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle<{ id: string; user_id?: string | null }>();
    if (riderError) throw riderError;
    if (!rider?.id) return NextResponse.json({ error: "Rider profile not found." }, { status: 404 });

    const { data: current, error: currentError } = await db
      .from("deliveries")
      .select("id, customer_id, delivery_code, status, rider_id, metadata")
      .eq("id", id)
      .single<{ id: string; customer_id?: string | null; delivery_code?: string | null; status: string; rider_id?: string | null; metadata?: Record<string, unknown> | null }>();
    if (currentError) throw currentError;

    if (current.rider_id !== rider.id) {
      return NextResponse.json({ error: "Only the assigned rider can update this delivery." }, { status: 403 });
    }

    const nextStatus = statusFlow[String(current.status)] || "delivered";
    const timestamp = new Date().toISOString();
    const patch: Record<string, unknown> = { status: nextStatus, updated_at: timestamp };
    if (current.status === "picked_up" && isCustomerPickupProofRequired(current.metadata)) {
      const proof = pickupProofFromMetadata(current.metadata);
      if (!proof?.url) {
        return NextResponse.json({ error: "Upload the package photo before starting the trip." }, { status: 409 });
      }
      if (proof.status === "rejected" && !proof.can_continue) {
        return NextResponse.json({ error: "Customer rejected this package photo. Upload a new photo before starting the trip." }, { status: 409 });
      }
      if (proof.status === "pending" && !pickupProofReviewExpired(proof)) {
        return NextResponse.json({ error: "Waiting for customer package confirmation. The trip can start after approval or when the review window ends." }, { status: 409 });
      }
      if (proof.status === "pending" && pickupProofReviewExpired(proof)) {
        patch.metadata = {
          ...metadataRecord(current.metadata),
          pickup_proof: {
            ...proof,
            status: "auto_approved",
            reviewed_at: timestamp,
            can_continue: true,
            note: "Customer review window expired."
          }
        };
      }
    }
    if (nextStatus === "picked_up") patch.picked_up_at = timestamp;
    if (nextStatus === "delivered") patch.delivered_at = timestamp;

    const { error: updateError } = await db.from("deliveries").update(patch).eq("id", id);
    if (updateError) throw updateError;

    await db.from("delivery_events").insert({
      delivery_id: id,
      actor_id: user.id,
      status: nextStatus,
      title: nextStatus.replaceAll("_", " "),
      body: "Rider updated this delivery."
    });
    await db.from("delivery_locations").update({ status: nextStatus, updated_at: timestamp }).eq("order_id", id);
    if (nextStatus === "delivered" || nextStatus === "cancelled") await releaseBicycleAssetForDelivery(db, id);
    const currentMetadata = metadataRecord(current.metadata);
    const linkedBusinessOrder = typeof currentMetadata.business_order_id === "string" && currentMetadata.business_order_id.trim();
    await Promise.allSettled([
      !linkedBusinessOrder && current.customer_id
        ? insertNotificationWithPush(db, {
            user_id: current.customer_id,
            title: nextStatus === "delivered" ? "Delivery completed" : "Delivery updated",
            body: `${current.delivery_code || "Your delivery"} is now ${nextStatus.replaceAll("_", " ")}.`,
            type: nextStatus === "delivered" ? "delivery_completed" : "delivery_update",
            metadata: { delivery_id: id, delivery_code: current.delivery_code || id, status: nextStatus, url: accountMessengerHref(current.delivery_code || id), tag: `ff-${current.delivery_code || id}` }
          })
        : Promise.resolve(),
      syncLinkedBusinessOrder(db, id, mapDeliveryStatusToBusinessOrder(nextStatus))
    ]);

    return updateResponse(db, id);
	  } catch (error) {
	    const message = error instanceof Error ? error.message : "Could not update rider job.";
	    return NextResponse.json({ error: message }, { status: message.includes("accepted by another rider") ? 409 : 500 });
	  }
	}

async function updateResponse(supabase: SupabaseClient, id: string) {
  const { data, error } = await supabase
    .from("deliveries")
    .select(jobSelect)
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
    .select("user_id, status, lga, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name")
    .eq("user_id", userId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{
      user_id: string;
      status: string;
      lga?: string | null;
      vehicle_type?: string | null;
      plate_number?: string | null;
      vehicle_color?: string | null;
      bank_name?: string | null;
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
        rider_account_type: "independent",
        address: application.lga || null,
        operating_zone: application.lga || null,
        vehicle_type: vehicleType,
        plate_number: application.plate_number || null,
        vehicle_color: application.vehicle_color || null,
        bank_name: application.bank_name || null,
        account_number: application.account_number || null,
        account_name: application.account_name || null,
        online: false,
        reviewed_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("id, vehicle_type, online, application_status, operating_zone, address")
    .maybeSingle<{ id: string; vehicle_type?: string | null; online?: boolean | null; application_status?: string | null; operating_zone?: string | null; address?: string | null }>();

  return data || null;
}

async function canRiderAcceptPickupState(
  db: SupabaseClient,
  userId: string,
  deliveryId: string
): Promise<{ ok: true; bicycle: boolean; riderProfileId: string } | { ok: false; error: string }> {
  const [{ data: rider, error: riderError }, { data: delivery, error: deliveryError }] = await Promise.all([
    db
      .from("rider_profiles")
      .select("id, operating_zone, address")
      .eq("user_id", userId)
      .maybeSingle<{ id: string; operating_zone?: string | null; address?: string | null }>(),
    db
      .from("deliveries")
      .select("id, pickup_address, pickup_latitude, pickup_longitude, distance_km, metadata")
      .eq("id", deliveryId)
      .maybeSingle<JobRow>()
  ]);

  if (riderError) throw riderError;
  if (deliveryError) throw deliveryError;
  const riderZone = rider?.operating_zone || rider?.address || "";
  if (!extractNigerianState(riderZone)) return { ok: false, error: "Your rider operating state is missing. Update your rider profile before accepting jobs." };
  const sameStatePickup = pickupMatchesRiderState(delivery?.pickup_address, riderZone, delivery?.metadata);
  let riderLocation: RiderLocationRow | null = null;
  if (!sameStatePickup && rider?.id) {
    const { data, error } = await db
      .from("rider_locations")
      .select("latitude, longitude, updated_at")
      .eq("rider_profile_id", rider.id)
      .maybeSingle<RiderLocationRow>();
    if (error) throw error;
    riderLocation = data || null;
  }
  if (!sameStatePickup && !jobMatchesCrossStateProximity(delivery || null, riderLocation)) {
    return { ok: false, error: `This pickup is outside your registered rider state and not within ${crossStatePickupRadiusKm}km of your latest live location.` };
  }
  const bicycle = isBicycleDelivery(delivery?.metadata);
  if (bicycle) {
    const asset = await loadAssignedBicycleAsset(db, rider?.id);
    if (!asset?.id || asset.status !== "available") {
      return { ok: false, error: "This delivery is reserved for an available assigned Fast Fleets bicycle." };
    }
  }
  return { ok: true, bicycle, riderProfileId: rider?.id || "" };
}

function jobMatchesRiderFleet(job: JobRow, bicycleAsset: RiderFleetAsset) {
  const bicycleJob = isBicycleDelivery(job.metadata);
  if (bicycleJob) return Boolean(bicycleAsset?.id && bicycleAsset.status === "available");
  return !bicycleAsset?.id;
}

function jobMatchesRiderDispatch(job: JobRow, riderZone: string | null | undefined, bicycleAsset: RiderFleetAsset, riderLocation: RiderLocationRow | null) {
  if (!jobMatchesRiderFleet(job, bicycleAsset)) return false;
  if (pickupMatchesRiderState(job.pickup_address, riderZone, job.metadata)) return true;
  return jobMatchesCrossStateProximity(job, riderLocation);
}

function jobMatchesCrossStateProximity(job: JobRow | null, riderLocation: RiderLocationRow | null) {
  if (!job || !isFreshLocation(riderLocation?.updated_at)) return false;
  const riderPoint = coordinatePoint(riderLocation?.latitude, riderLocation?.longitude);
  const pickupPoint = deliveryPickupPoint(job);
  if (!riderPoint || !pickupPoint) return false;
  if (haversineKm(riderPoint, pickupPoint) > crossStatePickupRadiusKm) return false;
  if (!isBicycleDelivery(job.metadata)) return true;
  const routeKm = Number(job.distance_km || job.metadata?.delivery_distance_km || job.metadata?.distance_km || 0);
  return Number.isFinite(routeKm) && routeKm > 0 && routeKm <= bicycleCrossStateRouteMaxKm;
}

function deliveryPickupPoint(job: JobRow) {
  const metadata = job.metadata || {};
  return coordinatePoint(job.pickup_latitude, job.pickup_longitude)
    || coordinatePoint(metadata.pickup_latitude, metadata.pickup_longitude)
    || coordinatePoint(metadata.pickupLatitude, metadata.pickupLongitude);
}

async function attachFleetAssetToDelivery(db: SupabaseClient, deliveryId: string, assetId: string, assetCode: string | null) {
  const { data: delivery } = await db
    .from("deliveries")
    .select("metadata")
    .eq("id", deliveryId)
    .maybeSingle<{ metadata?: Record<string, unknown> | null }>();
  const metadata = delivery?.metadata && typeof delivery.metadata === "object" && !Array.isArray(delivery.metadata) ? delivery.metadata : {};
  await db
    .from("deliveries")
    .update({
      fleet_asset_id: assetId,
      metadata: {
        ...metadata,
        fleet_asset_id: assetId,
        fleet_asset_code: assetCode
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", deliveryId);
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

function mapDeliveryStatusToBusinessOrder(status: string) {
  if (status === "accepted") return "rider_assigned";
  if (status === "picked_up") return "picked_up";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered") return "delivered";
  return null;
}

async function syncLinkedBusinessOrder(db: SupabaseClient, deliveryId: string, status: string | null) {
  if (!status) return;
  const { data: delivery } = await db
    .from("deliveries")
    .select("id, rider_id, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)")
    .eq("id", deliveryId)
    .maybeSingle<{
      id: string;
      rider_id?: string | null;
      metadata?: { business_order_id?: string } | null;
      rider_profiles?: { user_id?: string | null } | null;
    }>();
  const orderId = delivery?.metadata?.business_order_id;
  if (!orderId) return;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (delivery?.rider_profiles?.user_id) patch.rider_id = delivery.rider_profiles.user_id;
  if (status === "delivered") patch.delivered_at = new Date().toISOString();
  const { data: order } = await db.from("orders").update(patch).eq("id", orderId).select("id, order_code, customer_id, business_id").maybeSingle<{
    id: string;
    order_code?: string | null;
    customer_id?: string | null;
    business_id?: string | null;
  }>();
  const label = status === "rider_assigned" ? "Rider Assigned" : status === "picked_up" ? "Order Picked by Dispatch" : status === "in_transit" ? "On the Way" : status === "delivered" ? "Delivered" : status.replaceAll("_", " ");
  type PushNotificationInput = Parameters<typeof insertNotificationWithPush>[1];
  const orderCode = String(order?.order_code || order?.id || deliveryId);
  const notifications: Array<PushNotificationInput | null> = [
    order?.customer_id
      ? {
          user_id: order.customer_id,
          title: "Order status updated",
          body: `${order?.order_code || "Order"} is ${label}.`,
          type: "order_update",
          metadata: { order_id: order?.id, order_code: orderCode, delivery_id: deliveryId, status, url: accountMessengerHref(orderCode), tag: `ff-${orderCode}` }
        }
      : null,
    order?.business_id
      ? {
          user_id: order.business_id,
          title: "Order status updated",
          body: `${order?.order_code || "Order"} is ${label}.`,
          type: "business_order_update",
          metadata: { order_id: order?.id, order_code: orderCode, delivery_id: deliveryId, status, url: "/business/dashboard#marketplace-orders", tag: `ff-business-${orderCode}` }
        }
      : null
  ];
  const notificationRows = notifications.filter((notification): notification is PushNotificationInput => Boolean(notification));
  if (notificationRows.length) await Promise.allSettled(notificationRows.map((notification) => insertNotificationWithPush(db, notification)));
}
