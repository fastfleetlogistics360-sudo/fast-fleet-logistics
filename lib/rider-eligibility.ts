import { isBicycleDelivery } from "@/lib/fleet-assets";
import { pickupMatchesRiderState } from "@/lib/location/state-matching";
import { coordinatePoint, haversineKm, isFreshLocation } from "@/lib/location/proximity";
import type { DeliveryPolicy } from "@/lib/delivery-policy";

export type RiderEligibilityJob = {
  pickup_address?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  distance_km?: number | string | null;
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
  riderLocation,
  hasAvailableBicycle,
  policy
}: {
  job: RiderEligibilityJob;
  riderZone: string | null | undefined;
  riderLocation: RiderEligibilityLocation | null | undefined;
  hasAvailableBicycle: boolean;
  policy: DeliveryPolicy["rider"];
}) {
  const bicycleDelivery = isBicycleDelivery(job.metadata, job.vehicle_subtype);
  if (bicycleDelivery && !hasAvailableBicycle) return false;
  if (bicycleDelivery) {
    const routeKm = deliveryRouteKm(job);
    if (!Number.isFinite(routeKm) || routeKm <= 0 || routeKm > policy.bicycleMaxRouteKm) return false;
  }
  if (pickupMatchesRiderState(job.pickup_address, riderZone, job.metadata)) return true;
  if (!isFreshLocation(riderLocation?.updated_at, Date.now(), policy.locationFreshnessMinutes)) return false;

  const riderPoint = coordinatePoint(riderLocation?.latitude, riderLocation?.longitude);
  const pickupPoint = deliveryPickupPoint(job);
  if (!riderPoint || !pickupPoint || haversineKm(riderPoint, pickupPoint) > policy.crossBorderPickupRadiusKm) return false;

  return true;
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
