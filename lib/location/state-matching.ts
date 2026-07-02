import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

export type PickupStateMetadata = {
  pickup_state?: unknown;
  pickupState?: unknown;
  pickupStateName?: unknown;
};

export function extractNigerianState(value: string | null | undefined) {
  const direct = normalizeState(value);
  if (direct) return direct;

  const haystack = ` ${String(value || "").toLowerCase()} `;
  return NIGERIAN_STATES.find((state) => {
    const needle = state.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`, "i").test(haystack);
  }) || "";
}

export function extractPickupStateFromMetadata(metadata: PickupStateMetadata | null | undefined) {
  if (!metadata || typeof metadata !== "object") return "";
  const value = metadata.pickup_state || metadata.pickupState || metadata.pickupStateName;
  return extractNigerianState(typeof value === "string" ? value : "");
}

export function deliveryPickupState(pickupAddress: string | null | undefined, metadata?: PickupStateMetadata | null) {
  return extractPickupStateFromMetadata(metadata) || extractNigerianState(pickupAddress);
}

export function pickupMatchesRiderState(pickupAddress: string | null | undefined, riderZone: string | null | undefined, metadata?: PickupStateMetadata | null) {
  const riderState = extractNigerianState(riderZone);
  if (!riderState) return false;
  return deliveryPickupState(pickupAddress, metadata) === riderState;
}
