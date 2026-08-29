import type { SupabaseClient } from "@supabase/supabase-js";
import { createDeliveryQuoteFromRoute, type DeliveryQuote, type DeliveryQuoteInput } from "@/lib/delivery-quotes";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { type FareConfig } from "@/lib/fare";
import { getGoogleRouteEstimate, type RouteLocation } from "@/lib/maps/route-distance";
import { haversineKm } from "@/lib/location/proximity";
import { riderCanReceiveDelivery, type RiderEligibilityLocation } from "@/lib/rider-eligibility";
import type { VehicleType } from "@/types/domain";

export const customerVehicleOptionIds = ["bicycle", "motorcycle", "car", "van"] as const;
export type CustomerVehicleOptionId = (typeof customerVehicleOptionIds)[number];

export type CustomerVehicleSelection = {
  id: CustomerVehicleOptionId;
  vehicle: VehicleType;
  vehicleSubtype: "bicycle" | null;
  label: string;
};

export type CustomerVehicleAvailability = {
  status: "available" | "limited" | "unavailable";
  label: string;
  riderEtaMinutes: number | null;
};

export type CustomerVehicleOption = {
  id: CustomerVehicleOptionId;
  label: string;
  description: string;
  vehicle: VehicleType;
  vehicleSubtype: "bicycle" | null;
  quote: DeliveryQuote;
  availability: CustomerVehicleAvailability;
};

type CandidateRider = {
  id: string;
  vehicle_type?: string | null;
  operating_zone?: string | null;
  address?: string | null;
  campus_zone_id?: string | null;
};

type CandidateLocation = RiderEligibilityLocation & { rider_profile_id: string };

const selections: Record<CustomerVehicleOptionId, CustomerVehicleSelection> = {
  bicycle: { id: "bicycle", vehicle: "bike", vehicleSubtype: "bicycle", label: "Bicycle" },
  motorcycle: { id: "motorcycle", vehicle: "bike", vehicleSubtype: null, label: "Bike" },
  car: { id: "car", vehicle: "car", vehicleSubtype: null, label: "Car" },
  van: { id: "van", vehicle: "van", vehicleSubtype: null, label: "Van" }
};

export function customerVehicleSelection(value: unknown): CustomerVehicleSelection | null {
  const key = String(value || "").trim().toLowerCase() as CustomerVehicleOptionId;
  return selections[key] || null;
}

export function customerVehicleOptionForLegacyVehicle(vehicle: VehicleType, vehicleSubtype?: string | null) {
  if (vehicle === "bike") return customerVehicleSelection(vehicleSubtype === "bicycle" ? "bicycle" : "motorcycle");
  return customerVehicleSelection(vehicle);
}

export async function createCustomerVehicleOptions({
  input,
  fareConfig,
  db
}: {
  input: Omit<DeliveryQuoteInput, "vehicle" | "fareConfig" | "vehicleSubtypeOverride">;
  fareConfig: FareConfig;
  db: SupabaseClient;
}): Promise<CustomerVehicleOption[]> {
  const route = await getGoogleRouteEstimate({ origin: input.pickup, destination: input.dropoff });
  const motorcycle = createDeliveryQuoteFromRoute({ ...input, vehicle: "bike", fareConfig, vehicleSubtypeOverride: null }, route);
  const bicycle = createDeliveryQuoteFromRoute({ ...input, vehicle: "bike", fareConfig, vehicleSubtypeOverride: "bicycle" }, route);
  const car = createDeliveryQuoteFromRoute({ ...input, vehicle: "car", fareConfig }, route);
  const van = createDeliveryQuoteFromRoute({ ...input, vehicle: "van", fareConfig }, route);

  const available = await loadVehicleAvailability({
    db,
    pickup: input.pickup,
    pickupState: input.pickupState,
    options: [
      { selection: selections.motorcycle, quote: motorcycle },
      { selection: selections.car, quote: car },
      { selection: selections.van, quote: van },
      ...(bicycle.bicycleEligible ? [{ selection: selections.bicycle, quote: bicycle }] : [])
    ]
  });

  const definitions: Array<{ selection: CustomerVehicleSelection; quote: DeliveryQuote; description: string }> = [
    ...(bicycle.bicycleEligible ? [{ selection: selections.bicycle, quote: bicycle, description: "Light parcels on an assigned Fast Fleets bicycle." }] : []),
    { selection: selections.motorcycle, quote: motorcycle, description: "Fast everyday parcels and small shopping." },
    { selection: selections.car, quote: car, description: "More room for careful medium-sized deliveries." },
    { selection: selections.van, quote: van, description: "Bulky parcels, business stock, and larger loads." }
  ];

  return definitions.map(({ selection, quote, description }) => ({
    ...selection,
    description,
    quote,
    availability: available.get(selection.id) || unavailableAvailability()
  }));
}

async function loadVehicleAvailability({
  db,
  pickup,
  pickupState,
  options
}: {
  db: SupabaseClient;
  pickup: RouteLocation;
  pickupState?: string | null;
  options: Array<{ selection: CustomerVehicleSelection; quote: DeliveryQuote }>;
}) {
  const vehicleTypes = [...new Set(options.map((option) => option.selection.vehicle))];
  const { data: riderRows, error: riderError } = await db
    .from("rider_profiles")
    .select("id, vehicle_type, operating_zone, address, campus_zone_id")
    .eq("online", true)
    .eq("application_status", "approved")
    .in("vehicle_type", vehicleTypes)
    .limit(300);
  if (riderError) throw riderError;
  const riders = (riderRows || []) as CandidateRider[];
  const riderIds = riders.map((rider) => rider.id).filter(Boolean);
  if (!riderIds.length) return new Map(options.map((option) => [option.selection.id, unavailableAvailability()]));

  const [locationsResult, bicycleAssetsResult, allBicycleAssetsResult, activeDeliveriesResult, policy] = await Promise.all([
    db.from("rider_locations").select("rider_profile_id, latitude, longitude, updated_at").in("rider_profile_id", riderIds),
    db.from("fleet_assets").select("assigned_rider_profile_id").eq("asset_type", "bicycle").eq("status", "available").in("assigned_rider_profile_id", riderIds),
    db.from("fleet_assets").select("assigned_rider_profile_id").eq("asset_type", "bicycle").in("assigned_rider_profile_id", riderIds),
    db.from("deliveries").select("rider_id").in("rider_id", riderIds).in("status", ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation", "accepted_pending_delivery"]),
    loadDeliveryPolicy()
  ]);
  if (locationsResult.error) throw locationsResult.error;
  if (bicycleAssetsResult.error) throw bicycleAssetsResult.error;
  if (allBicycleAssetsResult.error) throw allBicycleAssetsResult.error;
  if (activeDeliveriesResult.error) throw activeDeliveriesResult.error;

  const locations = new Map<string, CandidateLocation>();
  for (const row of (locationsResult.data || []) as CandidateLocation[]) locations.set(row.rider_profile_id, row);
  const availableBicycleRiders = new Set((bicycleAssetsResult.data || []).map((asset) => String(asset.assigned_rider_profile_id || "")).filter(Boolean));
  const bicycleRiders = new Set((allBicycleAssetsResult.data || []).map((asset) => String(asset.assigned_rider_profile_id || "")).filter(Boolean));
  const busyRiders = new Set((activeDeliveriesResult.data || []).map((delivery) => String(delivery.rider_id || "")).filter(Boolean));
  const response = new Map<CustomerVehicleOptionId, CustomerVehicleAvailability>();

  for (const option of options) {
    const matches = riders.filter((rider) => {
      if (rider.vehicle_type !== option.selection.vehicle || busyRiders.has(rider.id)) return false;
      if (option.selection.id === "bicycle" && !availableBicycleRiders.has(rider.id)) return false;
      if (option.selection.id === "motorcycle" && bicycleRiders.has(rider.id)) return false;
      return riderCanReceiveDelivery({
        job: {
          pickup_address: pickup.address,
          pickup_latitude: pickup.latitude,
          pickup_longitude: pickup.longitude,
          distance_km: option.quote.distanceKm,
          vehicle_subtype: option.selection.vehicleSubtype,
          metadata: { pickup_state: pickupState || option.quote.pickupState }
        },
        riderZone: rider.operating_zone || rider.address,
        riderCampusZone: rider.campus_zone_id,
        riderLocation: locations.get(rider.id),
        hasAvailableBicycle: availableBicycleRiders.has(rider.id),
        policy: policy.rider
      });
    });
    response.set(option.selection.id, availabilityFor(matches, locations, pickup));
  }
  return response;
}

function availabilityFor(riders: CandidateRider[], locations: Map<string, CandidateLocation>, pickup: RouteLocation): CustomerVehicleAvailability {
  if (!riders.length) return unavailableAvailability();
  const pickupLatitude = Number(pickup.latitude);
  const pickupLongitude = Number(pickup.longitude);
  const riderEtas = riders
    .map((rider) => locations.get(rider.id))
    .filter((location): location is CandidateLocation => Boolean(location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)) && Number.isFinite(pickupLatitude) && Number.isFinite(pickupLongitude)))
    .map((location) => Math.max(4, Math.ceil((haversineKm({ latitude: Number(location.latitude), longitude: Number(location.longitude) }, { latitude: pickupLatitude, longitude: pickupLongitude }) / 20) * 60) + 3));
  return {
    status: riders.length === 1 ? "limited" : "available",
    label: riders.length === 1 ? "One nearby rider available" : "Riders available",
    riderEtaMinutes: riderEtas.length ? Math.min(...riderEtas) : null
  };
}

function unavailableAvailability(): CustomerVehicleAvailability {
  return { status: "unavailable", label: "No nearby rider available", riderEtaMinutes: null };
}
