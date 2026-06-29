import { estimateFare, PLATFORM_CHECKOUT_FEE_NGN } from "@/lib/fare";
import { sanitizeAddressText } from "@/lib/location/address-formatting";

export type MarketplaceKind = "restaurant" | "shopping";

export type MarketplacePricingItem = {
  store?: string;
  storeAddress?: string;
  pickupAddress?: string;
  mallLocation?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
};

export function estimateMarketplaceCheckout({
  kind,
  items,
  address
}: {
  kind?: MarketplaceKind;
  items: MarketplacePricingItem[];
  address: string;
}) {
  const marketplaceKind = kind === "shopping" ? "shopping" : "restaurant";
  const pickupAddress = marketplacePickupAddress(items, marketplaceKind);
  const dropoffAddress = sanitizeAddressText(address);
  const itemsTotal = items.reduce((sum, item) => sum + Math.round(Number(item.subtotal || 0)), 0);
  const fare = estimateFare({
    pickup: pickupAddress,
    dropoff: dropoffAddress,
    vehicle: "bike",
    speed: "same_day",
    zone: `${pickupAddress} ${dropoffAddress}`
  });

  return {
    itemsTotal,
    pickupAddress,
    distanceKm: fare.distanceKm,
    etaMinutes: fare.etaMinutes,
    deliveryFee: fare.deliveryFee,
    platformFee: PLATFORM_CHECKOUT_FEE_NGN,
    total: itemsTotal + fare.deliveryFee + PLATFORM_CHECKOUT_FEE_NGN
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
