import { estimateFareForDistance, normalizeFareConfig, type FareConfig } from "@/lib/fare";
import { classifyDelivery, type DeliveryRuleItem, type RouteType, type VehicleSubtype } from "@/lib/delivery-service-rules";
import { getGoogleRouteEstimate, type RouteLocation } from "@/lib/maps/route-distance";
import type { DeliverySpeed, FareEstimate, VehicleType } from "@/types/domain";

export type DeliveryQuoteInput = {
  pickup: RouteLocation;
  dropoff: RouteLocation;
  pickupState?: string | null;
  dropoffState?: string | null;
  vehicle: VehicleType;
  speed: DeliverySpeed;
  marketplaceKind?: "restaurant" | "shopping" | null;
  parcelType?: string | null;
  items?: DeliveryRuleItem[];
  fareConfig?: FareConfig;
};

export type DeliveryQuote = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupState: string;
  dropoffState: string;
  distanceKm: number;
  etaMinutes: number;
  durationSeconds: number;
  durationText: string;
  routeSource: "google-routes";
  routeType: RouteType;
  lightOrder: boolean;
  bicycleEligible: boolean;
  vehicleSubtype: VehicleSubtype | null;
  fare: FareEstimate;
};

export async function createDeliveryQuote(input: DeliveryQuoteInput): Promise<DeliveryQuote> {
  const fareConfig = normalizeFareConfig(input.fareConfig);
  const pickupAddress = cleanAddress(input.pickup.address);
  const dropoffAddress = cleanAddress(input.dropoff.address);
  const route = await getGoogleRouteEstimate({
    origin: input.pickup,
    destination: input.dropoff
  });
  const classification = classifyDelivery(
    {
      pickupAddress,
      dropoffAddress,
      pickupState: input.pickupState,
      dropoffState: input.dropoffState,
      distanceKm: route.distanceKm,
      vehicle: input.vehicle,
      marketplaceKind: input.marketplaceKind,
      parcelType: input.parcelType,
      items: input.items
    },
    fareConfig
  );
  const fare = estimateFareForDistance(
    {
      distanceKm: route.distanceKm,
      vehicle: input.vehicle,
      speed: input.speed,
      zone: `${pickupAddress} ${dropoffAddress}`,
      vehicleSubtype: classification.vehicleSubtype
    },
    fareConfig
  );
  const etaMinutes = Math.max(fare.etaMinutes, Math.round(route.durationSeconds / 60) || fare.etaMinutes);

  return {
    pickupAddress,
    dropoffAddress,
    pickupState: classification.pickupState,
    dropoffState: classification.dropoffState,
    distanceKm: route.distanceKm,
    etaMinutes,
    durationSeconds: route.durationSeconds,
    durationText: route.durationText,
    routeSource: route.source,
    routeType: classification.routeType,
    lightOrder: classification.lightOrder,
    bicycleEligible: classification.bicycleEligible,
    vehicleSubtype: classification.vehicleSubtype,
    fare: {
      ...fare,
      etaMinutes
    }
  };
}

function cleanAddress(value: unknown) {
  return String(value || "").trim();
}
