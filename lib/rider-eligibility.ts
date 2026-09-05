import { isBicycleDelivery } from "@/lib/fleet-assets";
import { pickupMatchesRiderState } from "@/lib/location/state-matching";
import { coordinatePoint, haversineKm, isFreshLocation } from "@/lib/location/proximity";
import type { DeliveryPolicy } from "@/lib/delivery-policy";

export type RiderEligibilityJob = {
  pickup_address?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  distance_km?: number | string | null;
  delivery_speed?: string | null;
  vehicle_subtype?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type RiderEligibilityLocation = {
  latitude?: number | string | null;
  longitude?: number | string | null;
  updated_at?: string | null;
};

export function riderCanReceiveDelivery({
  job,
  riderZone,
  riderCampusZone,
  riderLocation,
  hasAvailableBicycle,
  policy
}: {
  job: RiderEligibilityJob;
  riderZone: string | null | undefined;
  riderCampusZone?: string | null | undefined;
  riderLocation: RiderEligibilityLocation | null | undefined;
  hasAvailableBicycle: boolean;
  policy: DeliveryPolicy["rider"];
}) {
  if (!campusRiderCanReceive(job.metadata, riderCampusZone)) return false;
  const bicycleDelivery = isBicycleDelivery(job.metadata, job.vehicle_subtype);
  if (bicycleDelivery && !hasAvailableBicycle) return false;
  if (bicycleDelivery) {
    const routeKm = deliveryRouteKm(job);
    const campusCapKm = campusBicycleCapKm(job.metadata);
    if (!Number.isFinite(routeKm) || routeKm <= 0) return false;
    if (!campusCapKm && routeKm > policy.bicycleMaxRouteKm) return false;
    if (campusCapKm && routeKm > campusCapKm) return false;
  }
  if (pickupMatchesRiderState(job.pickup_address, riderZone, job.metadata)) return true;

  // A motorcycle may cross a state boundary only when the booking was quoted
  // and labelled as interstate. The rider who takes it must be registered in
  // the pickup state; the nearby-border exception is for local pickups only.
  if (isInterstateDispatch(job)) return false;
  if (!isFreshLocation(riderLocation?.updated_at, Date.now(), policy.locationFreshnessMinutes)) return false;

  const riderPoint = coordinatePoint(riderLocation?.latitude, riderLocation?.longitude);
  const pickupPoint = deliveryPickupPoint(job);
  if (!riderPoint || !pickupPoint || haversineKm(riderPoint, pickupPoint) > policy.crossBorderPickupRadiusKm) return false;

  return true;
}

function isInterstateDispatch(job: RiderEligibilityJob) {
  return job.delivery_speed === "interstate" || job.metadata?.interstate_dispatch === true;
}

export function campusRiderCanReceive(metadata: Record<string, unknown> | null | undefined, riderCampusZone?: string | null) {
  const campusZoneId = String(metadata?.campus_zone_id || "").trim();
  if (!campusZoneId) return true;
  const priorityUntil = Date.parse(String(metadata?.campus_rider_priority_until || ""));
  if (!Number.isFinite(priorityUntil) || priorityUntil <= Date.now()) return true;
  return String(riderCampusZone || "").trim() === campusZoneId;
}

export function deliveryPickupPoint(job: RiderEligibilityJob) {
  const metadata = job.metadata || {};
  return coordinatePoint(job.pickup_latitude, job.pickup_longitude)
    || coordinatePoint(metadata.pickup_latitude, metadata.pickup_longitude)
    || coordinatePoint(metadata.pickupLatitude, metadata.pickupLongitude);
}

export function deliveryRouteKm(job: RiderEligibilityJob) {
  return Number(job.distance_km || job.metadata?.delivery_distance_km || job.metadata?.distance_km || 0);
}

function campusBicycleCapKm(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata?.campus_zone_id) return 0;
  const value = Number(metadata.campus_bicycle_cap_km);
  return Number.isFinite(value) && value > 0 ? Math.min(30, value) : 0;
}
