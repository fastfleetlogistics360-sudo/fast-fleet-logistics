import { fastErrandDisplayDistanceKm, moneyNgn } from "@/lib/fast-errands-pricing";

export type FastErrandV2Snapshot = {
  schema_version: 2;
  pricing_mode: "neighborhood";
  goods_subtotal_ngn: number;
  service_fee_ngn: number;
  customer_total_ngn: number;
  minimum_cart_ngn: number;
  road_distance_meters: number;
  display_distance_km: number;
  service_area: { id: string; code: string; name: string; priority: number; pricing_version: number };
  pricing_band: { id?: string; min_distance_exclusive_meters: number; max_distance_inclusive_meters: number; service_fee_ngn: number };
  fulfilment: { business_profile_id: string; business_name: string | null; origin_address: string; origin_place_id: string | null; origin_latitude: number | null; origin_longitude: number | null };
  selected_vehicle: { id: string; vehicle: string; vehicle_subtype: string | null; label: string };
  customer_note: string | null;
  quote_fingerprint: string;
};

export function buildFastErrandV2Snapshot(input: Omit<FastErrandV2Snapshot, "schema_version" | "display_distance_km">): FastErrandV2Snapshot {
  return { ...input, schema_version: 2, display_distance_km: fastErrandDisplayDistanceKm(input.road_distance_meters) };
}

export function parseFastErrandV2Snapshot(value: unknown): FastErrandV2Snapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.schema_version !== 2 || item.pricing_mode !== "neighborhood" || !item.service_area || !item.fulfilment || !item.selected_vehicle) return null;
  const roadDistance = moneyNgn(item.road_distance_meters);
  const fee = moneyNgn(item.service_fee_ngn);
  const goods = moneyNgn(item.goods_subtotal_ngn);
  const total = moneyNgn(item.customer_total_ngn);
  if (!roadDistance || total !== goods + fee) return null;
  return item as unknown as FastErrandV2Snapshot;
}
