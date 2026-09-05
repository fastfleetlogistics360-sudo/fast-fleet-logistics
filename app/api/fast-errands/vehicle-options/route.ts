import { NextResponse } from "next/server";
import { createCustomerVehicleOptions } from "@/lib/customer-vehicle-options";
import { loadFareConfig } from "@/lib/fare-settings";
import { loadFastErrandsControls, loadFastErrandsFulfilmentBusinessId } from "@/lib/fast-errands-catalog";
import { businessPickupAddressFor, loadActiveLinkedBusiness } from "@/lib/marketplace-business-links";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";
import { normalizeState } from "@/lib/launch-states";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const FAST_ERRAND_FEE_NGN = 500;
const maxQuantityPerItem = 25;
type CheckoutItem = { itemId?: unknown; quantity?: unknown };
type CatalogItemRow = { id: string; category_id: string; name: string; description?: string | null; price_ngn: number; is_active: boolean };

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "fast-errands:vehicle-options" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { items?: CheckoutItem[]; address?: unknown };
    const address = sanitizeAddressText(String(payload.address || ""));
    const quantities = new Map<string, number>();
    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      const id = String(item?.itemId || "").trim();
      const quantity = Math.round(Number(item?.quantity || 0));
      if (!id || quantity < 1 || quantity > maxQuantityPerItem) return NextResponse.json({ error: "Choose valid FastErrand items and quantities." }, { status: 400 });
      quantities.set(id, Math.min(maxQuantityPerItem, (quantities.get(id) || 0) + quantity));
    }
    if (!quantities.size || quantities.size > 40 || address.length < 6) return NextResponse.json({ error: "Add FastErrand items and a delivery address first." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrands is temporarily unavailable." }, { status: 503 });
    const [controls, fulfilmentBusinessId] = await Promise.all([loadFastErrandsControls(), loadFastErrandsFulfilmentBusinessId()]);
    if (!controls.enabled) return NextResponse.json({ error: controls.customerNotice || "FastErrands is temporarily unavailable. Please try again later." }, { status: 503 });
    const business = fulfilmentBusinessId ? await loadActiveLinkedBusiness(db, fulfilmentBusinessId) : null;
    if (!business) return NextResponse.json({ error: "The FastErrands fulfilment account is not active." }, { status: 409 });
    const ids = [...quantities.keys()];
    const { data: itemRows, error: itemError } = await db.from("fast_errand_catalog_items").select("id, category_id, name, description, price_ngn, is_active").in("id", ids).eq("is_active", true);
    if (itemError || !itemRows || itemRows.length !== ids.length) return NextResponse.json({ error: "One or more FastErrand items are no longer available. Refresh your cart and try again." }, { status: 409 });
    const lineItems = (itemRows as CatalogItemRow[]).map((item) => ({ name: item.name, description: item.description || undefined, price: Math.round(Number(item.price_ngn)), quantity: quantities.get(item.id) || 1, subtotal: Math.round(Number(item.price_ngn)) * (quantities.get(item.id) || 1) }));
    const itemsTotal = lineItems.reduce((sum, item) => sum + item.subtotal, 0);
    const pickup = businessPickupAddressFor(business, "FastErrands fulfilment pickup");
    const pickupState = extractNigerianState(pickup);
    const dropoffState = extractNigerianState(address);
    const businessStates = [normalizeState(business.operating_state)].filter(Boolean);
    if (businessStates.length && (!dropoffState || !businessStates.includes(dropoffState))) return NextResponse.json({ error: `FastErrands currently serves ${businessStates.join(", ")}. Choose a delivery address in one of those states.` }, { status: 409 });
    const options = (await createCustomerVehicleOptions({
      db,
      fareConfig: await loadFareConfig(),
      input: { pickup: { address: pickup }, dropoff: { address }, pickupState, dropoffState, speed: "standard", parcelType: "FastErrands catalogue order", items: lineItems }
    })).filter((option) => option.id === "bicycle" || option.id === "motorcycle").map((option) => ({
      id: option.id,
      label: option.label,
      description: option.description,
      vehicle: option.vehicle,
      vehicleSubtype: option.vehicleSubtype,
      availability: option.availability,
      deliveryFee: option.quote.fare.deliveryFee,
      platformFee: FAST_ERRAND_FEE_NGN,
      total: itemsTotal + option.quote.fare.deliveryFee + FAST_ERRAND_FEE_NGN,
      etaMinutes: option.quote.etaMinutes,
      distanceKm: option.quote.distanceKm
    }));
    return NextResponse.json({ itemsTotal, options });
  } catch {
    return NextResponse.json({ error: "Could not check FastErrand rider options. Please try again." }, { status: 500 });
  }
}
