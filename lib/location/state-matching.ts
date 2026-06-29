import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

export function extractNigerianState(value: string | null | undefined) {
  const direct = normalizeState(value);
  if (direct) return direct;

  const haystack = ` ${String(value || "").toLowerCase()} `;
  return NIGERIAN_STATES.find((state) => {
    const needle = state.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${needle}([^a-z]|$)`, "i").test(haystack);
  }) || "";
}

export function pickupMatchesRiderState(pickupAddress: string | null | undefined, riderZone: string | null | undefined) {
  const riderState = extractNigerianState(riderZone);
  if (!riderState) return false;
  return extractNigerianState(pickupAddress) === riderState;
}
