import { NextResponse } from "next/server";
import { loadCampusProgram, resolveLecturerBenefit } from "@/lib/campus-program";
import { createCustomerVehicleOptions } from "@/lib/customer-vehicle-options";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { quoteLaunchDeliveryPromo } from "@/lib/promos/launch-first-150";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { DeliverySpeed } from "@/types/domain";

const deliverySpeeds = new Set(["standard", "same_day", "express", "priority", "scheduled", "interstate"]);

type OptionsPayload = {
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
  speed?: DeliverySpeed | "";
};

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "deliveries:vehicle-options" });
    if (limited) return limited;

    const payload = (await request.json().catch(() => ({}))) as OptionsPayload;
    const pickup = sanitizeAddressText(String(payload.pickup || ""));
    const dropoff = sanitizeAddressText(String(payload.dropoff || ""));
    const parcel = String(payload.parcel || "").trim();
    const speed = String(payload.speed || "") as DeliverySpeed;
    if (!pickup || !dropoff) return NextResponse.json({ error: "Add both pickup and drop-off addresses." }, { status: 400 });
    if (!parcel || !deliverySpeeds.has(speed)) return NextResponse.json({ error: "Choose a parcel type and delivery speed." }, { status: 400 });

    const supabase = await createClient();
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Live rider availability is temporarily unavailable. Please try again." }, { status: 503 });
    const [{ data: auth }, fareConfig, campusProgram] = await Promise.all([supabase.auth.getUser(), loadFareConfig(), loadCampusProgram()]);
    const options = await createCustomerVehicleOptions({
      input: {
        pickup: { address: pickup, placeId: payload.pickupPlaceId, latitude: payload.pickupLatitude, longitude: payload.pickupLongitude },
        dropoff: { address: dropoff, placeId: payload.dropoffPlaceId, latitude: payload.dropoffLatitude, longitude: payload.dropoffLongitude },
        pickupState: extractNigerianState(pickup) || extractNigerianState(payload.pickupState),
        dropoffState: extractNigerianState(dropoff) || extractNigerianState(payload.dropoffState),
        speed,
        parcelType: parcel
      },
      fareConfig,
      db: admin
    });

    const userId = auth.user?.id;
    const pricedOptions = await Promise.all(options.map(async (option) => {
      const promo = userId ? await quoteLaunchDeliveryPromo(admin, userId, option.quote) : null;
      const lecturerBenefit = await resolveLecturerBenefit({
        program: campusProgram,
        userId,
        address: pickup,
        deliveryFee: option.quote.fare.deliveryFee,
        platformFee: option.quote.fare.platformFee
      });
      const promoFare = promo?.applied
        ? { ...option.quote.fare, deliveryFee: promo.deliveryFee, platformFee: promo.platformFee, total: promo.total }
        : option.quote.fare;
      const fare = lecturerBenefit.applied ? { ...option.quote.fare, deliveryFee: 0, platformFee: 0, total: 0 } : promoFare;
      return {
        id: option.id,
        label: option.label,
        description: option.description,
        vehicle: option.vehicle,
        vehicleSubtype: option.vehicleSubtype,
        availability: option.availability,
        ...fare,
        originalDeliveryFee: option.quote.fare.deliveryFee,
        originalPlatformFee: option.quote.fare.platformFee,
        originalTotal: option.quote.fare.total,
        routeType: option.quote.routeType,
        routeSource: option.quote.routeSource,
        bicycleEligible: option.quote.bicycleEligible,
        launchPromo: lecturerBenefit.applied ? null : promo,
        campusBenefit: lecturerBenefit.applied ? { applied: true, message: lecturerBenefit.message } : null
      };
    }));

    return NextResponse.json({ options: pricedOptions });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load live rider options. Please try again." }, { status: 500 });
  }
}
