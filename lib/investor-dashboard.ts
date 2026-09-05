import type { SupabaseClient } from "@supabase/supabase-js";
import { loadInvestorProfileForUser } from "@/lib/investors";

type AssignmentRow = {
  id: string;
  fleet_asset_id: string;
  assigned_at: string;
  ended_at?: string | null;
  fleet_assets?: {
    id: string;
    asset_code?: string | null;
    status?: string | null;
    operating_state?: string | null;
    operating_zone?: string | null;
    assigned_rider_profile_id?: string | null;
    current_delivery_id?: string | null;
  } | null;
};

type DeliveryRow = {
  id: string;
  fleet_asset_id?: string | null;
  delivery_code?: string | null;
  status?: string | null;
  price_ngn?: number | string | null;
  created_at?: string | null;
  delivered_at?: string | null;
};

export async function loadInvestorDashboard(database: SupabaseClient, userId: string) {
  const investor = await loadInvestorProfileForUser(database, userId);
  if (!investor) return null;

  const { data: assignments, error: assignmentError } = await database
    .from("investor_asset_assignments")
    .select("id, fleet_asset_id, assigned_at, ended_at, fleet_assets(id, asset_code, status, operating_state, operating_zone, assigned_rider_profile_id, current_delivery_id)")
    .eq("investor_profile_id", investor.id)
    .is("ended_at", null)
    .order("assigned_at", { ascending: false })
    .returns<AssignmentRow[]>();
  if (assignmentError) throw assignmentError;

  const activeAssignments = assignments || [];
  const assetIds = activeAssignments.map((assignment) => assignment.fleet_asset_id);
  const { data: deliveries, error: deliveryError } = assetIds.length
    ? await database
        .from("deliveries")
        .select("id, fleet_asset_id, delivery_code, status, price_ngn, created_at, delivered_at")
        .in("fleet_asset_id", assetIds)
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<DeliveryRow[]>()
    : { data: [], error: null };
  if (deliveryError) throw deliveryError;

  const visibleDeliveries = (deliveries || []).filter((delivery) => {
    const assignment = activeAssignments.find((entry) => entry.fleet_asset_id === delivery.fleet_asset_id);
    return Boolean(assignment && (!delivery.created_at || new Date(delivery.created_at) >= new Date(assignment.assigned_at)));
  });
  const deliveriesByAsset = new Map<string, DeliveryRow[]>();
  for (const delivery of visibleDeliveries) {
    if (!delivery.fleet_asset_id) continue;
    const values = deliveriesByAsset.get(delivery.fleet_asset_id) || [];
    values.push(delivery);
    deliveriesByAsset.set(delivery.fleet_asset_id, values);
  }

  const assets = activeAssignments.map((assignment) => {
    const asset = assignment.fleet_assets;
    const history = deliveriesByAsset.get(assignment.fleet_asset_id) || [];
    const completed = history.filter((delivery) => delivery.status === "delivered");
    const current = asset?.current_delivery_id ? history.find((delivery) => delivery.id === asset.current_delivery_id) : null;
    return {
      id: assignment.fleet_asset_id,
      assetCode: asset?.asset_code || "Bicycle asset",
      status: asset?.status || "inactive",
      operatingState: asset?.operating_state || null,
      operatingZone: asset?.operating_zone || null,
      handlerAssigned: Boolean(asset?.assigned_rider_profile_id),
      currentDeliveryStatus: current?.status || (asset?.current_delivery_id ? "assigned" : null),
      completedDeliveries: completed.length,
      grossDeliveryValueNgn: completed.reduce((total, delivery) => total + Math.max(0, Number(delivery.price_ngn || 0)), 0)
    };
  });

  return {
    investor: {
      code: investor.investor_code,
      status: investor.status,
      onboardingCompleted: Boolean(investor.onboarding_completed_at)
    },
    summary: {
      assetCount: assets.length,
      completedDeliveries: assets.reduce((total, asset) => total + asset.completedDeliveries, 0),
      grossDeliveryValueNgn: assets.reduce((total, asset) => total + asset.grossDeliveryValueNgn, 0)
    },
    assets,
    recentActivity: visibleDeliveries.slice(0, 10).map((delivery) => ({
      assetCode: assets.find((asset) => asset.id === delivery.fleet_asset_id)?.assetCode || "Bicycle asset",
      deliveryCode: delivery.delivery_code || "Delivery",
      status: delivery.status || "updated",
      occurredAt: delivery.delivered_at || delivery.created_at || null
    }))
  };
}
