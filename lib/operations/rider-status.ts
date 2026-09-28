import { isFreshLocation } from "@/lib/location/proximity";

export const BLOCKING_RIDER_DELIVERY_STATUSES = [
  "accepted",
  "accepted_pending_delivery",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "awaiting_delivery_confirmation"
] as const;

export type OperationsRiderStatusInput = {
  approved: boolean;
  online: boolean;
  vehicleType?: string | null;
  independentBicycleEnabled?: boolean | null;
  assignedAssetStatus?: string | null;
  hasBlockingDelivery: boolean;
  locationUpdatedAt?: string | null;
  locationFreshnessMinutes: number;
};

/**
 * Operations deliberately keeps preference, work state, and GPS freshness
 * separate. This is the generic, job-independent subset of dispatch
 * eligibility: dispatch still evaluates the actual job's geography, distance,
 * campus and vehicle-subtype requirements before offering work.
 */
export function deriveOperationsRiderStatus(input: OperationsRiderStatusInput) {
  const vehicle = String(input.vehicleType || "").toLowerCase();
  const needsFleetBicycle = vehicle === "bike" || vehicle === "bicycle";
  const hasOperationalVehicle = !needsFleetBicycle
    || Boolean(input.independentBicycleEnabled)
    || input.assignedAssetStatus === "available";
  const locationFresh = isFreshLocation(input.locationUpdatedAt, Date.now(), input.locationFreshnessMinutes);
  const busy = input.online && input.hasBlockingDelivery;
  const available = input.online && input.approved && !input.hasBlockingDelivery && hasOperationalVehicle;

  return {
    online: input.online,
    offline: !input.online,
    busy,
    available,
    // This intentionally does not affect online, busy, or available. A fresh
    // pickup/geography check remains the canonical delivery-specific decision.
    location: input.locationUpdatedAt ? (locationFresh ? "fresh" : "stale") : "unavailable",
    locationFresh,
    hasOperationalVehicle
  } as const;
}

export function operationalVehicleLabel(vehicleType?: string | null, assetType?: string | null) {
  const value = String(assetType || vehicleType || "").toLowerCase();
  // `bike` is the legacy canonical dispatch bucket for motorcycle jobs. A
  // real assigned fleet asset supplies `bicycle` and takes precedence above.
  if (value === "bicycle") return "Bicycle";
  if (value === "bike") return "Motorcycle";
  if (value === "motorcycle") return "Motorcycle";
  if (value === "car") return "Car";
  if (value === "van") return "Van";
  return value ? value[0].toUpperCase() + value.slice(1) : "Not recorded";
}
