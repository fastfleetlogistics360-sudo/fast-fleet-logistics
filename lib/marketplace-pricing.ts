import type { FareConfig } from "@/lib/fare";
import type { DeliveryPolicy } from "@/lib/delivery-policy";
import { createDeliveryQuote, createDeliveryQuoteFromRoute, type DeliveryQuote } from "@/lib/delivery-quotes";
import { recommendedMarketplaceVehicle } from "@/lib/delivery-service-rules";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { applyCampusPrice, campusVendorZoneId, type CampusProgram } from "@/lib/campus-program";
import type { VehicleType } from "@/types/domain";

export type MarketplaceKind = "restaurant" | "shopping";

export type MarketplacePricingItem = {
  name?: string;
  productName?: string;
  category?: string;
  store?: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
  campusZoneId?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
};

export async function estimateMarketplaceCheckout({
  kind,
  items,
  address,
  pickupAddress,
  fareConfig,
  deliveryPolicy,
  campusProgram,
  vehicleOption
}: {
  kind?: MarketplaceKind;
  items: MarketplacePricingItem[];
  address: string;
  pickupAddress?: string | null;
  fareConfig?: FareConfig;
  deliveryPolicy: DeliveryPolicy;
  campusProgram?: CampusProgram;
  vehicleOption?: "bicycle" | "motorcycle";
}) {
  const marketplaceKind = kind === "shopping" ? "shopping" : "restaurant";
  const resolvedPickupAddress = sanitizeAddressText(pickupAddress || "") || marketplacePickupAddress(items, marketplaceKind);
  const dropoffAddress = sanitizeAddressText(address);
  const itemsTotal = items.reduce((sum, item) => sum + Math.round(Number(item.subtotal || 0)), 0);
  const initialQuote = await createDeliveryQuote({
    pickup: { address: resolvedPickupAddress },
    dropoff: { address: dropoffAddress },
    vehicle: "bike",
    speed: "same_day",
    marketplaceKind,
    items,
    fareConfig
  });
  // Marketplace orders intentionally use the same light-delivery choices as
  // FastErrands. The default is retained for callers that only need a legacy
  // estimate, while checkout supplies one of these explicit customer choices.
  const vehicle = vehicleOption ? "bike" : recommendedMarketplaceVehicle({ kind: marketplaceKind, items });
  const marketplacePolicy = evaluateMarketplacePolicy({ kind: marketplaceKind, items, quote: initialQuote, deliveryPolicy });
  const speed = marketplacePolicy.interstateDispatch ? "interstate" : "same_day";
  const quote = quoteForMarketplaceVehicle({
    pickupAddress: resolvedPickupAddress,
    dropoffAddress,
    marketplaceKind,
    items,
    fareConfig,
    vehicle,
    speed,
    initialQuote,
    vehicleSubtypeOverride: vehicleOption === "bicycle" ? "bicycle" : vehicleOption === "motorcycle" ? null : undefined
  });
  const campusAdjustment = applyCampusPrice({
    program: campusProgram || { ...DEFAULT_CAMPUS_PROGRAM_DISABLED },
    campusZoneId: campusVendorZoneId(items),
    distanceKm: quote.distanceKm,
    deliveryFee: quote.fare.deliveryFee,
    platformFee: quote.fare.platformFee,
    bicycleEligible: quote.vehicle === "bike" && quote.lightOrder
  });
  const bicycleEligible = campusAdjustment.applied ? true : quote.bicycleEligible;
  const vehicleSubtype = vehicleOption === "motorcycle" ? null : vehicleOption === "bicycle" ? (bicycleEligible ? "bicycle" : null) : bicycleEligible ? "bicycle" : quote.vehicleSubtype;
  const campusEtaMinutes = campusAdjustment.applied
    ? Math.max(quote.etaMinutes, Math.round((quote.distanceKm / (campusProgram?.bicycleSpeedKmh || DEFAULT_CAMPUS_PROGRAM_DISABLED.bicycleSpeedKmh)) * 60 + 22))
    : quote.etaMinutes;

  return {
    itemsTotal,
    pickupAddress: resolvedPickupAddress,
    dropoffAddress,
    pickupState: quote.pickupState,
    dropoffState: quote.dropoffState,
    distanceKm: quote.distanceKm,
    etaMinutes: campusEtaMinutes,
    durationSeconds: quote.durationSeconds,
    routeSource: quote.routeSource,
    routeType: quote.routeType,
    lightOrder: quote.lightOrder,
    bicycleEligible,
    vehicleSubtype,
    vehicle: quote.vehicle,
    deliverySpeed: quote.speed,
    allowed: marketplacePolicy.allowed,
    policyMessage: marketplacePolicy.message,
    interstateDispatch: marketplacePolicy.interstateDispatch,
    interstateDeliveryDays: marketplacePolicy.interstateDeliveryDays,
    deliveryFee: campusAdjustment.deliveryFee,
    platformFee: campusAdjustment.platformFee,
    campusAdjustment,
    total: itemsTotal + campusAdjustment.deliveryFee + campusAdjustment.platformFee
  };
}

const DEFAULT_CAMPUS_PROGRAM_DISABLED: CampusProgram = {
  enabled: false,
  zoneId: "",
  universityName: "",
  universityAddress: "",
  latitude: null,
  longitude: null,
  radiusKm: 20,
  bicycleCapKm: 20,
  normalPricingAfterKm: 30,
  deliveryFeeCapNgn: 1000,
  campusRiderPayoutNgn: 300,
  overagePerKmNgn: 80,
  bicycleSpeedKmh: 15,
  riderPriorityMinutes: 4,
  lecturerEnrollments: []
};

function quoteForMarketplaceVehicle({
  pickupAddress,
  dropoffAddress,
  marketplaceKind,
  items,
  fareConfig,
  vehicle,
  speed,
  initialQuote,
  vehicleSubtypeOverride
}: {
  pickupAddress: string;
  dropoffAddress: string;
  marketplaceKind: MarketplaceKind;
  items: MarketplacePricingItem[];
  fareConfig?: FareConfig;
  vehicle: VehicleType;
  speed: "same_day" | "interstate";
  initialQuote: DeliveryQuote;
  vehicleSubtypeOverride?: "bicycle" | null;
}) {
  if (vehicle === initialQuote.vehicle && speed === initialQuote.speed && vehicleSubtypeOverride === undefined) return initialQuote;
  return createDeliveryQuoteFromRoute(
    {
      pickup: { address: pickupAddress },
      dropoff: { address: dropoffAddress },
      vehicle,
      speed,
      marketplaceKind,
      items,
      fareConfig,
      vehicleSubtypeOverride
    },
    {
      distanceKm: initialQuote.distanceKm,
      durationSeconds: initialQuote.durationSeconds,
      durationText: initialQuote.durationText,
      source: initialQuote.routeSource
    }
  );
}

function evaluateMarketplacePolicy({
  kind,
  items,
  quote,
  deliveryPolicy
}: {
  kind: MarketplaceKind;
  items: MarketplacePricingItem[];
  quote: DeliveryQuote;
  deliveryPolicy: DeliveryPolicy;
}) {
  const perishable = kind === "restaurant" || items.some((item) => /grocery|produce|fresh|meat|fish|dairy|bakery/i.test(`${item.name || ""} ${item.productName || ""} ${item.category || ""}`));
  if (perishable && quote.distanceKm > deliveryPolicy.marketplace.freshFoodMaxRouteKm) {
    return {
      allowed: false,
      message: "This kitchen is too far for fresh delivery to your address. Please choose a kitchen or store closer to you.",
      interstateDispatch: false,
      interstateDeliveryDays: null
    };
  }

  const interstateDispatch = !perishable && quote.routeType === "cross_state_long";
  return {
    allowed: true,
    message: interstateDispatch ? `Interstate dispatch: delivery may take up to ${deliveryPolicy.marketplace.interstateDeliveryDays} business days after the seller prepares your order.` : null,
    interstateDispatch,
    interstateDeliveryDays: interstateDispatch ? deliveryPolicy.marketplace.interstateDeliveryDays : null
  };
}

export function marketplacePickupAddress(items: MarketplacePricingItem[], kind: MarketplaceKind) {
  const candidates = configuredMarketplacePickupAddresses(items);
  const unique = Array.from(new Set(candidates));

  return unique.join(", ") || (kind === "shopping" ? "Shopping pickup" : "Restaurant pickup");
}

export function configuredMarketplacePickupAddress(items: MarketplacePricingItem[]) {
  const unique = Array.from(new Set(configuredMarketplacePickupAddresses(items)));
  return unique.length === 1 ? unique[0] : "";
}

function configuredMarketplacePickupAddresses(items: MarketplacePricingItem[]) {
  return items
    .map((item) => item.pickupAddress || item.storeAddress || item.mallLocation || item.store || "")
    .map((value) => sanitizeAddressText(value))
    .filter(Boolean);
}
