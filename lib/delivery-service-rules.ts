import { normalizeState } from "@/lib/launch-states";
import { extractNigerianState } from "@/lib/location/state-matching";
import type { FareConfig } from "@/lib/fare";
import type { VehicleType } from "@/types/domain";

export type RouteType = "same_state" | "cross_state_local" | "cross_state_long" | "unknown";
export type VehicleSubtype = "bicycle";

export type DeliveryRuleItem = {
  name?: string;
  productName?: string;
  category?: string;
  quantity?: number;
};

export type DeliveryRuleInput = {
  pickupAddress: string;
  dropoffAddress: string;
  pickupState?: string | null;
  dropoffState?: string | null;
  distanceKm: number;
  vehicle: VehicleType;
  marketplaceKind?: "restaurant" | "shopping" | null;
  parcelType?: string | null;
  items?: DeliveryRuleItem[];
};

export type DeliveryClassification = {
  pickupState: string;
  dropoffState: string;
  routeType: RouteType;
  bicycleEligible: boolean;
  vehicleSubtype: VehicleSubtype | null;
  lightOrder: boolean;
};

const crossStateLocalMaxKm = 30;
const bulkyItemPattern = /\b(5kg|10kg|25kg|50kg|crate|carton|bulk|gas|cylinder|furniture|appliance|tv|television|generator|cement|bag of|sack|drum)\b/i;

export function classifyDelivery(input: DeliveryRuleInput, fareConfig: FareConfig): DeliveryClassification {
  const pickupState = normalizeState(input.pickupState || extractNigerianState(input.pickupAddress));
  const dropoffState = normalizeState(input.dropoffState || extractNigerianState(input.dropoffAddress));
  const routeType = classifyRouteType(pickupState, dropoffState, input.distanceKm);
  const lightOrder = isLightOrder(input);
  const bicycleEligible =
    input.vehicle === "bike" &&
    lightOrder &&
    Number(input.distanceKm || 0) > 0 &&
    Number(input.distanceKm || 0) <= fareConfig.bicycleMaxDistanceKm;

  return {
    pickupState,
    dropoffState,
    routeType,
    bicycleEligible,
    vehicleSubtype: bicycleEligible ? "bicycle" : null,
    lightOrder
  };
}

function classifyRouteType(pickupState: string, dropoffState: string, distanceKm: number): RouteType {
  if (!pickupState || !dropoffState) return "unknown";
  if (pickupState === dropoffState) return "same_state";
  return distanceKm <= crossStateLocalMaxKm ? "cross_state_local" : "cross_state_long";
}

function isLightOrder(input: DeliveryRuleInput) {
  if (input.marketplaceKind === "restaurant") return true;
  if (input.marketplaceKind === "shopping") return isLightMarketplaceCart(input.items);

  const parcel = String(input.parcelType || "").toLowerCase();
  if (!parcel) return false;
  if (/(document|food|meal|grocery|retail|small|light|pharmacy|medicine|fashion|clothes|clothing|envelope|electronics|gadget|gadgets|phone|accessory|accessories)/i.test(parcel)) {
    return !bulkyItemPattern.test(parcel);
  }
  return false;
}

function isLightMarketplaceCart(items: DeliveryRuleItem[] | undefined) {
  if (!items?.length) return false;
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, Math.round(Number(item.quantity || 1))), 0);
  if (totalQuantity > 4) return false;

  return items.every((item) => {
    const label = `${item.name || ""} ${item.productName || ""} ${item.category || ""}`;
    return !bulkyItemPattern.test(label);
  });
}
