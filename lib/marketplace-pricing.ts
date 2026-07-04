import type { FareConfig } from "@/lib/fare";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { sanitizeAddressText } from "@/lib/location/address-formatting";

export type MarketplaceKind = "restaurant" | "shopping";

export type MarketplacePricingItem = {
  name?: string;
  productName?: string;
  category?: string;
  store?: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
};

export async function estimateMarketplaceCheckout({
  kind,
  items,
  address,
  pickupAddress,
  fareConfig
}: {
  kind?: MarketplaceKind;
  items: MarketplacePricingItem[];
  address: string;
  pickupAddress?: string | null;
  fareConfig?: FareConfig;
}) {
  const marketplaceKind = kind === "shopping" ? "shopping" : "restaurant";
  const resolvedPickupAddress = sanitizeAddressText(pickupAddress || "") || marketplacePickupAddress(items, marketplaceKind);
  const dropoffAddress = sanitizeAddressText(address);
  const itemsTotal = items.reduce((sum, item) => sum + Math.round(Number(item.subtotal || 0)), 0);
  const quote = await createDeliveryQuote({
    pickup: { address: resolvedPickupAddress },
    dropoff: { address: dropoffAddress },
    vehicle: "bike",
    speed: "same_day",
    marketplaceKind,
    items,
    fareConfig
  });

  return {
    itemsTotal,
    pickupAddress: resolvedPickupAddress,
    dropoffAddress,
    pickupState: quote.pickupState,
    dropoffState: quote.dropoffState,
    distanceKm: quote.distanceKm,
    etaMinutes: quote.etaMinutes,
    durationSeconds: quote.durationSeconds,
    routeSource: quote.routeSource,
    routeType: quote.routeType,
    lightOrder: quote.lightOrder,
    bicycleEligible: quote.bicycleEligible,
    vehicleSubtype: quote.vehicleSubtype,
    deliveryFee: quote.fare.deliveryFee,
    platformFee: quote.fare.platformFee,
    total: itemsTotal + quote.fare.deliveryFee + quote.fare.platformFee
  };
}

export function marketplacePickupAddress(items: MarketplacePricingItem[], kind: MarketplaceKind) {
  const candidates = items
    .map((item) => item.pickupAddress || item.storeAddress || item.mallLocation || item.store || "")
    .map((value) => sanitizeAddressText(value))
    .filter(Boolean);
  const unique = Array.from(new Set(candidates));

  return unique.join(", ") || (kind === "shopping" ? "Shopping pickup" : "Restaurant pickup");
}
