/**
 * Shared, side-effect-free boundary used by the current Business Dashboard
 * transition route and future Marketplace Operations endpoints. Authorization
 * stays at the caller; delivery/payment side effects remain canonical.
 */
const permittedTransitions = new Set(["received", "preparing", "packing", "ready_for_pickup"]);

export function parseMarketplaceOrderTransition(value: unknown) {
  const status = typeof value === "string" ? value.trim() : "";
  if (!permittedTransitions.has(status)) throw new MarketplaceOrderTransitionError("Choose a valid business order status.");
  return status;
}

export function transitionCreatesDelivery(status: string, existingDeliveryId: string | null) {
  return status === "ready_for_pickup" && !existingDeliveryId;
}

export class MarketplaceOrderTransitionError extends Error {}
