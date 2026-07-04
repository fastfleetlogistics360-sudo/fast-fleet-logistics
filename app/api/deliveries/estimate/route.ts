import { NextResponse } from "next/server";
import { loadFareConfig } from "@/lib/fare-settings";
import { createDeliveryQuote, type DeliveryQuoteInput } from "@/lib/delivery-quotes";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import type { DeliverySpeed, VehicleType } from "@/types/domain";

const vehicleTypes = new Set(["bike", "car", "van"]);
const deliverySpeeds = new Set(["standard", "same_day", "express", "priority", "scheduled", "interstate"]);

type EstimatePayload = {
  pickup?: string;
  pickupState?: string;
  pickupPlaceId?: string;
  pickupLatitude?: number;
  pickupLongitude?: number;
  dropoff?: string;
  dropoffState?: string;
  dropoffPlaceId?: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  parcel?: string;
  vehicle?: VehicleType | "";
  speed?: DeliverySpeed | "";
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as EstimatePayload;
    const pickup = sanitizeAddressText(String(payload.pickup || ""));
    const dropoff = sanitizeAddressText(String(payload.dropoff || ""));
    const vehicle = String(payload.vehicle || "") as VehicleType;
    const speed = String(payload.speed || "") as DeliverySpeed;

    if (!pickup || !dropoff) return NextResponse.json({ error: "Add both pickup and drop-off addresses." }, { status: 400 });
    if (!vehicleTypes.has(vehicle) || !deliverySpeeds.has(speed)) {
      return NextResponse.json({ error: "Choose a valid vehicle and delivery speed." }, { status: 400 });
    }

    const fareConfig = await loadFareConfig();
    const quote = await createDeliveryQuote({
      pickup: {
        address: pickup,
        placeId: payload.pickupPlaceId,
        latitude: payload.pickupLatitude,
        longitude: payload.pickupLongitude
      },
      dropoff: {
        address: dropoff,
        placeId: payload.dropoffPlaceId,
        latitude: payload.dropoffLatitude,
        longitude: payload.dropoffLongitude
      },
      pickupState: extractNigerianState(pickup) || extractNigerianState(payload.pickupState),
      dropoffState: extractNigerianState(dropoff) || extractNigerianState(payload.dropoffState),
      vehicle,
      speed,
      parcelType: payload.parcel,
      fareConfig
    } satisfies DeliveryQuoteInput);

    return NextResponse.json({
      distanceKm: quote.distanceKm,
      etaMinutes: quote.etaMinutes,
      baseFare: quote.fare.baseFare,
      distanceFare: quote.fare.distanceFare,
      speedMultiplier: quote.fare.speedMultiplier,
      deliveryFee: quote.fare.deliveryFee,
      platformFee: quote.fare.platformFee,
      total: quote.fare.total,
      currency: quote.fare.currency,
      routeType: quote.routeType,
      routeSource: quote.routeSource,
      bicycleEligible: quote.bicycleEligible,
      vehicleSubtype: quote.vehicleSubtype
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not estimate delivery." }, { status: 500 });
  }
}
