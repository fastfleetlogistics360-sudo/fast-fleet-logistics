import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { loadFareConfig } from "@/lib/fare-settings";
import { extractNigerianState } from "@/lib/location/state-matching";

export type StorageDuration = "day_1" | "day_3" | "week_1" | "week_2" | "month_1";
const durations: Record<StorageDuration, { label: string; days: number; rate: "daily" | "weekly" | "monthly"; units: number }> = {
  day_1: { label: "1 Day", days: 1, rate: "daily", units: 1 }, day_3: { label: "3 Days", days: 3, rate: "daily", units: 3 }, week_1: { label: "1 Week", days: 7, rate: "weekly", units: 1 }, week_2: { label: "2 Weeks", days: 14, rate: "weekly", units: 2 }, month_1: { label: "1 Month", days: 30, rate: "monthly", units: 1 }
};
type Requested = { itemId?: unknown; quantity?: unknown; otherDescription?: unknown };
type Catalog = { id: string; name: string; storage_band: string; description: string | null; daily_rate_ngn: number | string; weekly_rate_ngn: number | string; monthly_rate_ngn: number | string; requires_review: boolean; is_other: boolean; is_active: boolean; pricing_version: number | string };
type Facility = { id: string; name: string; address: string; place_id: string | null; latitude: number | string | null; longitude: number | string | null; service_area: string | null };

export class StorageQuoteError extends Error { readonly status: number; constructor(message: string, status = 409) { super(message); this.status = status; } }
export function storageDuration(value: unknown) { return durations[String(value || "") as StorageDuration]; }

export async function resolveStorageQuote(input: { db: SupabaseClient; items: Requested[]; duration: unknown; pickupSelected: boolean; pickupAddress?: string; pickupVehicle?: "bike" | "car" | "van" }) {
  const durationKey = String(input.duration || "") as StorageDuration; const duration = storageDuration(durationKey);
  if (!duration) throw new StorageQuoteError("Choose a valid storage duration.", 400);
  const facilityResult = await input.db.from("storage_facilities").select("id, name, address, place_id, latitude, longitude, service_area").eq("is_active", true).order("created_at").limit(1).maybeSingle<Facility>();
  if (facilityResult.error) throw facilityResult.error;
  if (!facilityResult.data) throw new StorageQuoteError("Storage bookings are not available yet. Please check back shortly.");
  const requested = Array.isArray(input.items) ? input.items : [];
  if (!requested.length || requested.length > 30) throw new StorageQuoteError("Choose between one and 30 storage items.", 400);
  const ids = requested.map((item) => String(item.itemId || "").trim()).filter(Boolean);
  if (!ids.length || new Set(ids).size !== ids.length) throw new StorageQuoteError("Choose valid storage items.", 400);
  const { data, error } = await input.db.from("storage_catalog_items").select("id, name, storage_band, description, daily_rate_ngn, weekly_rate_ngn, monthly_rate_ngn, requires_review, is_other, is_active, pricing_version").in("id", ids).eq("is_active", true);
  if (error) throw error; if (!data || data.length !== ids.length) throw new StorageQuoteError("One or more storage items are unavailable. Refresh your booking.");
  const rows = data as Catalog[];
  const items = requested.map((request) => {
    const item = rows.find((row) => row.id === String(request.itemId || "").trim()); const quantity = Math.round(Number(request.quantity || 0));
    if (!item || quantity < 1 || quantity > 50) throw new StorageQuoteError("Choose valid item quantities.", 400);
    const otherDescription = String(request.otherDescription || "").trim().slice(0, 500);
    if (item.is_other && otherDescription.length < 3) throw new StorageQuoteError("Describe your Other Item so our team can review it.", 400);
    const rate = Math.round(Number(duration.rate === "daily" ? item.daily_rate_ngn : duration.rate === "weekly" ? item.weekly_rate_ngn : item.monthly_rate_ngn));
    return { item_id: item.id, name: item.name, storage_band: item.storage_band, description: item.description, other_description: item.is_other ? otherDescription : null, quantity, rate_ngn: rate, pricing_version: Number(item.pricing_version), subtotal_ngn: rate * duration.units * quantity, requires_review: item.requires_review || item.is_other };
  });
  const storageSubtotalNgn = items.reduce((sum, item) => sum + item.subtotal_ngn, 0);
  let pickup: { feeNgn: number; distanceKm: number; etaMinutes: number; vehicle: string; routeSource: string } | null = null;
  if (input.pickupSelected) {
    const address = String(input.pickupAddress || "").trim(); const vehicle = input.pickupVehicle || "bike";
    if (address.length < 6) throw new StorageQuoteError("Add a pickup address for collection.", 400);
    const delivery = await createDeliveryQuote({ pickup: { address }, dropoff: { address: facilityResult.data.address, placeId: facilityResult.data.place_id, latitude: numberOrNull(facilityResult.data.latitude), longitude: numberOrNull(facilityResult.data.longitude) }, pickupState: extractNigerianState(address), dropoffState: extractNigerianState(facilityResult.data.address), vehicle, speed: "standard", parcelType: "Storage facility pickup", fareConfig: await loadFareConfig() });
    pickup = { feeNgn: Math.max(0, Math.round(delivery.fare.deliveryFee + delivery.fare.platformFee)), distanceKm: delivery.distanceKm, etaMinutes: delivery.etaMinutes, vehicle, routeSource: delivery.routeSource };
  }
  const fingerprint = createHash("sha256").update(JSON.stringify({ ids: items.map((item) => [item.item_id, item.quantity, item.rate_ngn, item.other_description]), duration: durationKey, pickup: pickup ? [pickup.feeNgn, pickup.distanceKm, pickup.vehicle] : null, facility: facilityResult.data.id })).digest("hex");
  return { facility: facilityResult.data, durationKey, duration, items, storageSubtotalNgn, pickup, totalNgn: storageSubtotalNgn + (pickup?.feeNgn || 0), fingerprint };
}
function numberOrNull(value: unknown) { const number = Number(value); return Number.isFinite(number) ? number : null; }
