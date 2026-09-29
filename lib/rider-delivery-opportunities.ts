import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAssignedBicycleAsset, isBicycleDelivery } from "@/lib/fleet-assets";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { riderCanReceiveDelivery } from "@/lib/rider-eligibility";
import type { DeliveryPolicy } from "@/lib/delivery-policy";

type DispatchDelivery = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  distance_km: number;
  price_ngn?: number | null;
  delivery_fee_ngn?: number | null;
  vehicle_type: string;
  vehicle_subtype?: string | null;
  metadata: Record<string, unknown>;
};

/**
 * Sends a single, durable opportunity notification to every rider who is
 * eligible at dispatch time. `rider_delivery_notifications` is the idempotency
 * gate, so retried order creation/realtime work cannot spam a rider.
 */
export async function notifyEligibleRiders(db: SupabaseClient, delivery: DispatchDelivery, policy: DeliveryPolicy["rider"]) {
  const { data: riders } = await db
    .from("rider_profiles")
    .select("id, user_id, vehicle_type, independent_bicycle_enabled, operating_zone, address, campus_zone_id")
    .eq("application_status", "approved")
    .eq("online", true)
    .limit(25);

  const bicycle = isBicycleDelivery(delivery.metadata, delivery.vehicle_subtype);
  await Promise.allSettled(
    (riders || []).map(async (rider) => {
      if (rider.vehicle_type !== delivery.vehicle_type) return;
      const [locationResult, asset, activeTripsResult, queuedTripsResult] = await Promise.all([
        db.from("rider_locations").select("latitude, longitude, updated_at").eq("rider_profile_id", rider.id).maybeSingle(),
        bicycle ? loadAssignedBicycleAsset(db, rider.id) : Promise.resolve(null),
        db.from("deliveries").select("id").eq("rider_id", rider.id).in("status", ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"]).limit(1),
        db.from("deliveries").select("id").eq("rider_id", rider.id).eq("status", "accepted_pending_delivery").limit(1)
      ]);
      if (queuedTripsResult.data?.length) return;
      const hasActiveTrip = Boolean(activeTripsResult.data?.length);
      const hasAvailableBicycle = Boolean(rider.independent_bicycle_enabled || (asset?.id && (asset.status === "available" || (hasActiveTrip && asset.status === "busy"))));
      if (!riderCanReceiveDelivery({
        job: delivery,
        riderZone: rider.operating_zone || rider.address,
        riderCampusZone: rider.campus_zone_id,
        riderLocation: locationResult.data || null,
        hasAvailableBicycle,
        policy
      })) return;

      // Insert first: a duplicate means this rider has already been offered this delivery.
      const { error: gateError } = await db.from("rider_delivery_notifications").insert({
        delivery_id: delivery.id,
        rider_profile_id: rider.id,
        notification_type: "delivery_opportunity"
      });
      if (gateError) return;

      const pickupArea = delivery.pickup_address.split(",")[0]?.trim() || "your area";
      const earning = Number(delivery.delivery_fee_ngn ?? delivery.price_ngn ?? 0);
      await insertNotificationWithPush(db, {
        user_id: rider.user_id,
        title: "New delivery available",
        body: `${pickupArea}${earning > 0 ? ` · Estimated earning: ₦${earning.toLocaleString("en-NG")}` : ""}`,
        type: "dispatch_request",
        metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code, url: "/rider/dashboard?tab=jobs", tag: `ff-dispatch-${delivery.delivery_code}` }
      });
    })
  );
}
