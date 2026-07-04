import type { SupabaseClient } from "@supabase/supabase-js";

export type FleetAssetStatus = "available" | "busy" | "maintenance" | "inactive";
export type FleetAssetType = "bicycle";

export type FleetAssetRow = {
  id: string;
  asset_code?: string | null;
  asset_type?: FleetAssetType | string | null;
  status?: FleetAssetStatus | string | null;
  operating_state?: string | null;
  operating_zone?: string | null;
  assigned_rider_profile_id?: string | null;
  assigned_user_id?: string | null;
  current_delivery_id?: string | null;
  notes?: string | null;
};

export function deliveryVehicleSubtype(metadata: Record<string, unknown> | null | undefined, explicitSubtype?: unknown) {
  const value = String(explicitSubtype || metadata?.vehicle_subtype || metadata?.vehicleSubtype || "").trim().toLowerCase();
  return value === "bicycle" ? "bicycle" : null;
}

export function isBicycleDelivery(metadata: Record<string, unknown> | null | undefined, explicitSubtype?: unknown) {
  return deliveryVehicleSubtype(metadata, explicitSubtype) === "bicycle";
}

export async function loadAssignedBicycleAsset(db: SupabaseClient, riderProfileId: string | null | undefined) {
  if (!riderProfileId) return null;
  try {
    const { data, error } = await db
      .from("fleet_assets")
      .select("id, asset_code, asset_type, status, operating_state, operating_zone, assigned_rider_profile_id, assigned_user_id, current_delivery_id, notes")
      .eq("asset_type", "bicycle")
      .eq("assigned_rider_profile_id", riderProfileId)
      .limit(1)
      .maybeSingle<FleetAssetRow>();
    if (error) {
      if (isMissingFleetTable(error)) return null;
      throw error;
    }
    return data || null;
  } catch (error) {
    if (isMissingFleetTable(error)) return null;
    throw error;
  }
}

export async function riderCanHandleBicycleDelivery(db: SupabaseClient, riderProfileId: string | null | undefined) {
  const asset = await loadAssignedBicycleAsset(db, riderProfileId);
  return Boolean(asset?.id && asset.status === "available");
}

export async function markBicycleAssetBusy(db: SupabaseClient, riderProfileId: string | null | undefined, deliveryId: string) {
  const asset = await loadAssignedBicycleAsset(db, riderProfileId);
  if (!asset?.id || asset.status !== "available") return null;
  const { data, error } = await db
    .from("fleet_assets")
    .update({
      status: "busy",
      current_delivery_id: deliveryId,
      updated_at: new Date().toISOString()
    })
    .eq("id", asset.id)
    .eq("status", "available")
    .select("id, asset_code")
    .maybeSingle<{ id: string; asset_code?: string | null }>();
  if (error) {
    if (isMissingFleetTable(error)) return null;
    throw error;
  }
  return data || null;
}

export async function releaseBicycleAssetForDelivery(db: SupabaseClient, deliveryId: string) {
  try {
    const { error } = await db
      .from("fleet_assets")
      .update({
        status: "available",
        current_delivery_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("asset_type", "bicycle")
      .eq("current_delivery_id", deliveryId);
    if (error && !isMissingFleetTable(error)) throw error;
  } catch (error) {
    if (!isMissingFleetTable(error)) throw error;
  }
}

function isMissingFleetTable(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("fleet_assets") && (message.includes("does not exist") || message.includes("schema cache"));
}
