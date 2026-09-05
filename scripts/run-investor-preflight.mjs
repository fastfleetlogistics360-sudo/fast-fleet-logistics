import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const environment = loadEnvironment(".env.local");
const url = environment.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required in .env.local.");
}

const database = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const [assetsResult, deliveriesResult, relationshipResult, activeDeliveryResult] = await Promise.all([
  database
    .from("fleet_assets")
    .select("id, asset_code, asset_type, status, assigned_rider_profile_id, assigned_user_id, current_delivery_id", { count: "exact" })
    .limit(1000),
  database
    .from("deliveries")
    .select("id, fleet_asset_id, rider_id, status, delivered_at", { count: "exact" })
    .not("fleet_asset_id", "is", null)
    .limit(1000),
  database
    .from("deliveries")
    .select("id, fleet_asset_id, fleet_assets!deliveries_fleet_asset_id_fkey(id)")
    .not("fleet_asset_id", "is", null)
    .limit(1),
  database
    .from("deliveries")
    .select("id, status")
    .in("status", ["accepted", "accepted_pending_delivery", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"])
    .limit(1000)
]);

const report = {
  checkedAt: new Date().toISOString(),
  assets: summarizeResult(assetsResult),
  deliveryAssetLinks: summarizeResult(deliveriesResult),
  deliveryAssetForeignKey: summarizeResult(relationshipResult),
  activeDeliveries: summarizeResult(activeDeliveryResult)
};

if (!assetsResult.error && !deliveriesResult.error) {
  const assetById = new Map((assetsResult.data || []).map((asset) => [asset.id, asset]));
  const linkedDeliveries = deliveriesResult.data || [];
  report.relationships = {
    missingAssetReferences: linkedDeliveries.filter((delivery) => !assetById.has(delivery.fleet_asset_id)).map((delivery) => delivery.id),
    assignedRiderMismatches: linkedDeliveries
      .filter((delivery) => {
        const asset = assetById.get(delivery.fleet_asset_id);
        return Boolean(asset?.assigned_rider_profile_id && delivery.rider_id && asset.assigned_rider_profile_id !== delivery.rider_id);
      })
      .map((delivery) => delivery.id),
    statusCounts: (assetsResult.data || []).reduce((counts, asset) => {
      counts[asset.status] = (counts[asset.status] || 0) + 1;
      return counts;
    }, {}),
    busyAssetsWithoutCurrentDelivery: (assetsResult.data || [])
      .filter((asset) => asset.status === "busy" && !asset.current_delivery_id)
      .map((asset) => asset.id),
    currentDeliveriesMissingFromActiveSet: (assetsResult.data || [])
      .filter((asset) => asset.current_delivery_id && !(activeDeliveryResult.data || []).some((delivery) => delivery.id === asset.current_delivery_id))
      .map((asset) => asset.id)
  };
}

console.log(JSON.stringify(report, null, 2));

function loadEnvironment(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return values;
}

function summarizeResult(result) {
  if (result.error) return { error: result.error.message, code: result.error.code || null };
  return { count: result.count ?? result.data?.length ?? 0 };
}
