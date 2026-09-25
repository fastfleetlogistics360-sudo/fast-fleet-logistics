import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createCustomerVehicleOptions, type CustomerVehicleOption, type CustomerVehicleSelection } from "@/lib/customer-vehicle-options";
import { loadFareConfig } from "@/lib/fare-settings";
import { loadFastErrandsCatalog, loadFastErrandsControls } from "@/lib/fast-errands-catalog";
import { findFastErrandBand, fastErrandDisplayDistanceKm, fastErrandMinimumProgress, moneyNgn, type FastErrandPricingBand } from "@/lib/fast-errands-pricing";
import { loadActiveLinkedBusiness } from "@/lib/marketplace-business-links";
import { getGoogleRouteEstimate, type GoogleRouteEstimate, type RouteLocation } from "@/lib/maps/route-distance";
import { extractNigerianState } from "@/lib/location/state-matching";

const maxQuantityPerItem = 25;
export type FastErrandRequestedItem = { itemId?: unknown; quantity?: unknown };
type AreaRow = { id: string; code: string; name: string; business_profile_id: string; origin_address: string; origin_place_id: string | null; origin_latitude: number | string | null; origin_longitude: number | string | null; maximum_distance_meters: number | string; minimum_cart_ngn: number | string; priority: number | string; pricing_version: number | string; is_active: boolean };
type ItemRow = { id: string; category_id: string; name: string; description: string | null; price_ngn: number | string; image_url: string | null; is_active: boolean };

export type FastErrandResolvedQuote = {
  fingerprint: string;
  items: Array<{ item_id: string; category_id: string; category: string; name: string; description: string | null; image_url: string | null; price: number; quantity: number; subtotal: number }>;
  goodsSubtotalNgn: number;
  minimumCartNgn: number;
  amountToMinimumNgn: number;
  serviceFeeNgn: number;
  customerTotalNgn: number;
  roadDistanceMeters: number;
  displayDistanceKm: number;
  etaMinutes: number;
  route: GoogleRouteEstimate;
  area: AreaRow;
  band: FastErrandPricingBand;
  business: Awaited<ReturnType<typeof loadActiveLinkedBusiness>> & {};
  vehicleOptions: CustomerVehicleOption[];
};

export class FastErrandQuoteError extends Error { constructor(message: string, readonly status = 409, readonly code = "fast_errand_unavailable") { super(message); } }

export async function resolveFastErrandQuote(input: { db: SupabaseClient; items: FastErrandRequestedItem[]; address: string; selectedVehicle?: CustomerVehicleSelection | null }) : Promise<FastErrandResolvedQuote> {
  const controls = await loadFastErrandsControls();
  if (!controls.enabled) throw new FastErrandQuoteError(controls.customerNotice || "FastErrands is temporarily unavailable.", 503, "paused");
  if (controls.mode !== "neighborhood") throw new FastErrandQuoteError("Neighborhood FastErrand is not active yet. Please use another Fast Fleets delivery service.", 409, "legacy_mode");
  const quantities = normalizeRequestedItems(input.items);
  if (!quantities.size) throw new FastErrandQuoteError("Add FastErrand items before requesting a quote.", 400, "invalid_items");
  if (quantities.size > 40) throw new FastErrandQuoteError("Choose no more than 40 different FastErrand items.", 400, "invalid_items");
  const [catalog, areasResult] = await Promise.all([
    loadFastErrandsCatalog(true),
    input.db.from("fast_errand_service_areas").select("id, code, name, business_profile_id, origin_address, origin_place_id, origin_latitude, origin_longitude, maximum_distance_meters, minimum_cart_ngn, priority, pricing_version, is_active").eq("is_active", true).order("priority")
  ]);
  if (areasResult.error) throw areasResult.error;
  const allItems = catalog.flatMap((category) => category.items.map((item) => ({ ...item, category: category.name, category_active: category.is_active }))) as Array<ItemRow & { category: string; category_active: boolean }>;
  const resolvedItems = [...quantities.entries()].map(([id, quantity]) => {
    const item = allItems.find((entry) => entry.id === id);
    if (!item || !item.is_active || !item.category_active) throw new FastErrandQuoteError("One or more FastErrand items are no longer available. Refresh your cart and try again.", 409, "stale_cart");
    const price = moneyNgn(item.price_ngn);
    return { item_id: item.id, category_id: item.category_id, category: item.category, name: item.name, description: item.description || null, image_url: item.image_url || null, price, quantity, subtotal: price * quantity };
  });
  const goodsSubtotalNgn = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);
  const areas = (areasResult.data || []) as AreaRow[];
  if (!areas.length) throw new FastErrandQuoteError("FastErrand is not yet available at this address. Try another Fast Fleets delivery service.", 409, "outside_area");
  const candidates = await Promise.all(areas.map(async (area) => {
    const business = await loadActiveLinkedBusiness(input.db, area.business_profile_id);
    if (!business) return null;
    const bandsResult = await input.db.from("fast_errand_service_area_bands").select("id, min_distance_exclusive_meters, max_distance_inclusive_meters, service_fee_ngn, sort_order, is_active").eq("service_area_id", area.id).eq("is_active", true).order("min_distance_exclusive_meters");
    if (bandsResult.error) throw bandsResult.error;
    const origin: RouteLocation = { address: area.origin_address, placeId: area.origin_place_id, latitude: numberOrNull(area.origin_latitude), longitude: numberOrNull(area.origin_longitude) };
    try {
      const route = await getGoogleRouteEstimate({ origin, destination: { address: input.address } });
      if (route.distanceMeters > moneyNgn(area.maximum_distance_meters)) return null;
      const band = findFastErrandBand(route.distanceMeters, (bandsResult.data || []) as FastErrandPricingBand[]);
      return band ? { area, business, route, band, origin } : null;
    } catch { return null; }
  }));
  const valid = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate)).sort((a, b) => a.route.distanceMeters - b.route.distanceMeters || moneyNgn(a.area.priority) - moneyNgn(b.area.priority));
  if (!valid.length) throw new FastErrandQuoteError("This address is outside the current FastErrand service area. Try another Fast Fleets delivery service.", 409, "outside_area");
  if (valid.length > 1 && valid[0].route.distanceMeters === valid[1].route.distanceMeters && moneyNgn(valid[0].area.priority) === moneyNgn(valid[1].area.priority)) throw new FastErrandQuoteError("FastErrand service configuration needs attention. Please try another Fast Fleets delivery service.", 503, "ambiguous_area");
  const selected = valid[0];
  const minimumCartNgn = moneyNgn(selected.area.minimum_cart_ngn) || 1500;
  const amountToMinimumNgn = fastErrandMinimumProgress(goodsSubtotalNgn, minimumCartNgn);
  if (amountToMinimumNgn) throw new FastErrandQuoteError(`Add NGN ${amountToMinimumNgn.toLocaleString("en-NG")} more to reach the NGN ${minimumCartNgn.toLocaleString("en-NG")} FastErrand minimum.`, 409, "minimum_cart");
  const pickupState = extractNigerianState(selected.area.origin_address) || undefined;
  const dropoffState = extractNigerianState(input.address) || undefined;
  const allOptions = await createCustomerVehicleOptions({ db: input.db, fareConfig: await loadFareConfig(), route: selected.route, input: { pickup: selected.origin, dropoff: { address: input.address }, pickupState, dropoffState, speed: "standard", parcelType: "FastErrand neighbourhood procurement", items: resolvedItems } });
  const vehicleOptions = allOptions.filter((option) => option.id === "bicycle" || option.id === "motorcycle");
  if (input.selectedVehicle && !vehicleOptions.some((option) => option.id === input.selectedVehicle!.id && option.availability.status !== "unavailable")) throw new FastErrandQuoteError("That rider option is no longer available. Choose another option and refresh your quote.", 409, "vehicle_unavailable");
  const fingerprint = quoteFingerprint({ items: resolvedItems, address: input.address, area: selected.area, distance: selected.route.distanceMeters, band: selected.band, minimumCartNgn, vehicle: input.selectedVehicle?.id || null });
  return { fingerprint, items: resolvedItems, goodsSubtotalNgn, minimumCartNgn, amountToMinimumNgn, serviceFeeNgn: selected.band.feeNgn, customerTotalNgn: goodsSubtotalNgn + selected.band.feeNgn, roadDistanceMeters: selected.route.distanceMeters, displayDistanceKm: fastErrandDisplayDistanceKm(selected.route.distanceMeters), etaMinutes: Math.max(1, Math.round(selected.route.durationSeconds / 60)), route: selected.route, area: selected.area, band: selected.band, business: selected.business, vehicleOptions };
}

function normalizeRequestedItems(items: FastErrandRequestedItem[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    const id = String(item?.itemId || "").trim(); const quantity = Math.round(Number(item?.quantity || 0));
    if (!id || quantity < 1 || quantity > maxQuantityPerItem) throw new FastErrandQuoteError("Choose valid FastErrand item quantities.", 400, "invalid_items");
    const next = (quantities.get(id) || 0) + quantity;
    if (next > maxQuantityPerItem) throw new FastErrandQuoteError("Choose no more than 25 of one FastErrand item.", 400, "invalid_items");
    quantities.set(id, next);
  }
  return quantities;
}
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function quoteFingerprint(value: unknown) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
