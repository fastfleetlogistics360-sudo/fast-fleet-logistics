import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { BLOCKING_RIDER_DELIVERY_STATUSES, deriveOperationsRiderStatus, operationalVehicleLabel } from "@/lib/operations/rider-status";
import { createAdminClient } from "@/lib/supabase/admin";

const pageSize = 25;
const searchLimit = 80;

type RiderRow = { id: string; user_id: string; application_status?: string | null; online?: boolean | null; vehicle_type?: string | null; operating_zone?: string | null; independent_bicycle_enabled?: boolean | null; users?: { full_name?: string | null; phone?: string | null } | null };
type AssetRow = { id: string; asset_code?: string | null; asset_type?: string | null; status?: string | null; operating_state?: string | null; operating_zone?: string | null; assigned_rider_profile_id?: string | null; current_delivery_id?: string | null };
type DeliveryRow = { id: string; rider_id?: string | null; delivery_code?: string | null; status?: string | null; vehicle_type?: string | null; pickup_address?: string | null; dropoff_address?: string | null; accepted_at?: string | null; created_at?: string | null };

export async function GET(request: NextRequest) {
  const actor = await requireAdminSession();
  if (!actor) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Operations data is not configured." }, { status: 503 });

  try {
    const params = request.nextUrl.searchParams;
    const page = Math.max(0, Math.floor(Number(params.get("page") || 0)));
    const filter = String(params.get("filter") || "all").toLowerCase();
    const vehicle = String(params.get("vehicle") || "").trim().toLowerCase();
    const state = String(params.get("state") || "").trim().slice(0, 80);
    const queryText = String(params.get("q") || "").trim().slice(0, searchLimit);
    let query = db.from("rider_profiles")
      .select("id, user_id, application_status, online, vehicle_type, operating_zone, independent_bicycle_enabled, users:users!rider_profiles_user_id_fkey(full_name, phone)", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (filter === "online" || filter === "available" || filter === "busy" || filter === "stale") query = query.eq("online", true);
    if (filter === "offline") query = query.eq("online", false);
    if (vehicle) query = query.eq("vehicle_type", vehicle);
    if (state) query = query.ilike("operating_zone", `%${escapeLike(state)}%`);
    if (queryText) query = query.or(`id.eq.${queryText},users.full_name.ilike.%${escapeLike(queryText)}%,users.phone.ilike.%${escapeLike(queryText)}%`);
    const [{ data: profiles, count, error }, policy] = await Promise.all([query, loadDeliveryPolicy()]);
    if (error) throw error;
    const riders = (profiles || []) as RiderRow[];
    const riderIds = riders.map((rider) => rider.id);
    const [locationsResponse, assetsResponse, deliveriesResponse] = await Promise.all([
      riderIds.length ? db.from("rider_locations").select("rider_profile_id, latitude, longitude, updated_at").in("rider_profile_id", riderIds) : Promise.resolve({ data: [] }),
      riderIds.length ? db.from("fleet_assets").select("id, asset_code, asset_type, status, operating_state, operating_zone, assigned_rider_profile_id, current_delivery_id").in("assigned_rider_profile_id", riderIds) : Promise.resolve({ data: [] }),
      riderIds.length ? db.from("deliveries").select("id, rider_id, delivery_code, status, vehicle_type, pickup_address, dropoff_address, accepted_at, created_at").in("rider_id", riderIds).in("status", [...BLOCKING_RIDER_DELIVERY_STATUSES]).order("updated_at", { ascending: false }).limit(pageSize * 2) : Promise.resolve({ data: [] })
    ]);
    const locationsResult = locationsResponse as any;
    const assetsResult = assetsResponse as any;
    const deliveriesResult = deliveriesResponse as any;
    if (locationsResult.error || assetsResult.error || deliveriesResult.error) throw locationsResult.error || assetsResult.error || deliveriesResult.error;
    const locations = new Map<string, { updated_at?: string | null }>((locationsResult.data || []).map((location: any) => [String(location.rider_profile_id), location]));
    const assets = new Map<string, AssetRow>((assetsResult.data || []).map((asset: AssetRow) => [String(asset.assigned_rider_profile_id), asset]));
    const activeDeliveries = new Map<string, DeliveryRow>();
    for (const delivery of (deliveriesResult.data || []) as DeliveryRow[]) if (delivery.rider_id && !activeDeliveries.has(delivery.rider_id)) activeDeliveries.set(delivery.rider_id, delivery);
    const rows = riders.map((rider) => {
      const asset = assets.get(rider.id) || null;
      const delivery = activeDeliveries.get(rider.id) || null;
      const location = locations.get(rider.id) || null;
      const status = deriveOperationsRiderStatus({
        approved: rider.application_status === "approved", online: Boolean(rider.online), vehicleType: rider.vehicle_type,
        independentBicycleEnabled: rider.independent_bicycle_enabled, assignedAssetStatus: asset?.status,
        hasBlockingDelivery: Boolean(delivery), locationUpdatedAt: location?.updated_at, locationFreshnessMinutes: policy.rider.locationFreshnessMinutes
      });
      return {
        id: rider.id, name: rider.users?.full_name || "Unnamed rider", phone: rider.users?.phone || null,
        approval_status: rider.application_status || "unknown", operating_zone: rider.operating_zone || null,
        vehicle: operationalVehicleLabel(rider.vehicle_type, asset?.asset_type), online: status.online, available: status.available, busy: status.busy, offline: status.offline,
        location_status: status.location, location_updated_at: location?.updated_at || null,
        asset: asset ? { id: asset.id, code: asset.asset_code || asset.id, status: asset.status || "unknown", ownership: "Company asset", operating_state: asset.operating_state || null, operating_zone: asset.operating_zone || null } : null,
        delivery: delivery ? { id: delivery.id, code: delivery.delivery_code || delivery.id, status: delivery.status || "unknown", vehicle: operationalVehicleLabel(delivery.vehicle_type), accepted_at: delivery.accepted_at || null, pickup: delivery.pickup_address || null, destination: delivery.dropoff_address || null } : null
      };
    }).filter((rider) => filter === "all" || filter === "online" ? true : filter === "offline" ? rider.offline : filter === "available" ? rider.available : filter === "busy" ? rider.busy : filter === "stale" ? rider.online && rider.location_status !== "fresh" : true);
    const assetIds = rows.map((row) => row.asset?.id).filter((id): id is string => Boolean(id));
    // Ownership is resolved from the active, append-only assignment relationship;
    // an asset being assigned to a rider never makes that rider its owner.
    const investorAssets = assetIds.length ? await db.from("investor_asset_assignments").select("fleet_asset_id").is("ended_at", null).in("fleet_asset_id", assetIds) : { data: [] };
    const investorAssetIds = new Set((investorAssets.data || []).map((entry: any) => String(entry.fleet_asset_id || "")));
    for (const row of rows) if (row.asset && investorAssetIds.has(row.asset.id)) row.asset.ownership = "Investor asset";
    const summaryResult = await db.rpc("operations_rider_summary", { freshness_minutes: policy.rider.locationFreshnessMinutes });
    const summary = summaryResult as unknown as { data?: Array<{ online?: number; available?: number; busy?: number; offline?: number; location_stale?: number }> | null; error?: { message?: string } | null };
    // A checkout that has not yet received the forward-only migration remains
    // usable with the bounded page counts, while deployed environments receive
    // the database aggregate rather than a browser-wide rider download.
    const aggregate = summary.data?.[0];
    const counts = aggregate ? { online: Number(aggregate.online || 0), offline: Number(aggregate.offline || 0), available: Number(aggregate.available || 0), busy: Number(aggregate.busy || 0), location_stale: Number(aggregate.location_stale || 0) } : { online: rows.filter((r) => r.online).length, offline: rows.filter((r) => r.offline).length, available: rows.filter((r) => r.available).length, busy: rows.filter((r) => r.busy).length, location_stale: rows.filter((r) => r.online && r.location_status !== "fresh").length };
    return NextResponse.json({ riders: rows, pagination: { page, page_size: pageSize, total: count || 0 }, counts, definitions: { available: "Approved, intentionally online riders with no blocking delivery and an operational required bicycle asset. Final delivery offers still apply the canonical job-specific geography and route checks.", busy: "Intentionally online riders with an accepted, queued, pickup, transit, or delivery-confirmation job.", location_stale: `Online riders whose latest location is missing or older than the configured ${policy.rider.locationFreshnessMinutes}-minute freshness policy.` }, location_freshness_minutes: policy.rider.locationFreshnessMinutes });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Rider & Fleet Operations." }, { status: 500 }); }
}

function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
