import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { normalizeState } from "@/lib/launch-states";
import type { FleetAssetStatus } from "@/lib/fleet-assets";

const assetStatuses = new Set(["available", "busy", "maintenance", "inactive"]);

const demoFleetAssets = [
  {
    id: "FLEET-BICYCLE-001",
    asset_code: "FF-BICYCLE-001",
    asset_type: "bicycle",
    status: "available",
    operating_state: "Lagos",
    operating_zone: "Lekki / VI",
    assigned_rider_profile_id: null,
    assigned_user_id: null,
    current_delivery_id: null,
    notes: "Demo bicycle asset",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

const assetSelect =
  "id, asset_code, asset_type, status, operating_state, operating_zone, assigned_rider_profile_id, assigned_user_id, current_delivery_id, notes, created_at, updated_at, rider_profiles:assigned_rider_profile_id(id, user_id, operating_zone, users:users!rider_profiles_user_id_fkey(full_name, phone, email))";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ fleetAssets: demoFleetAssets, demo: true });
    return NextResponse.json(missingServiceResponse("fleet assets"), { status: 503 });
  }

  const { data, error } = await supabase.from("fleet_assets").select(assetSelect).order("asset_code", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ fleetAssets: data || [] });
}

export async function POST(request: Request) {
  return upsertFleetAsset(request, false);
}

export async function PATCH(request: Request) {
  return upsertFleetAsset(request, true);
}

async function upsertFleetAsset(request: Request, editing: boolean) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = text(body.id);
  const assetCode = text(body.asset_code || body.assetCode).toUpperCase();
  const status = normalizeStatus(body.status);
  const operatingState = normalizeState(text(body.operating_state || body.operatingState));
  const operatingZone = text(body.operating_zone || body.operatingZone);
  const assignedRiderProfileId = text(body.assigned_rider_profile_id || body.assignedRiderProfileId);
  const notes = text(body.notes);

  if (editing && !id) return NextResponse.json({ error: "Choose a fleet asset to update." }, { status: 400 });
  if (!assetCode || assetCode.length < 4) return NextResponse.json({ error: "Add a clear bicycle asset code." }, { status: 400 });
  if (!operatingState) return NextResponse.json({ error: "Choose the bicycle operating state." }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to manage fleet assets." }, { status: 503 });

  let assignedUserId: string | null = null;
  if (assignedRiderProfileId) {
    const { data: rider, error: riderError } = await supabase
      .from("rider_profiles")
      .select("id, user_id, application_status, rider_account_type, vehicle_type")
      .eq("id", assignedRiderProfileId)
      .maybeSingle<{ id: string; user_id?: string | null; application_status?: string | null; rider_account_type?: string | null; vehicle_type?: string | null }>();
    if (riderError) return NextResponse.json({ error: riderError.message }, { status: 400 });
    if (!rider?.id || rider.application_status !== "approved") {
      return NextResponse.json({ error: "Assign bicycles only to approved rider accounts." }, { status: 400 });
    }
    let duplicateQuery = supabase
      .from("fleet_assets")
      .select("id, asset_code")
      .eq("asset_type", "bicycle")
      .eq("assigned_rider_profile_id", assignedRiderProfileId)
      .limit(1);
    if (editing) duplicateQuery = duplicateQuery.neq("id", id);
    const { data: duplicateAsset, error: duplicateError } = await duplicateQuery.maybeSingle<{ id: string; asset_code?: string | null }>();
    if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 400 });
    if (duplicateAsset?.id) {
      return NextResponse.json({ error: `This operator is already assigned to ${duplicateAsset.asset_code || "another bicycle"}.` }, { status: 400 });
    }
    assignedUserId = rider.user_id || null;
    await supabase.from("rider_profiles").update({ rider_account_type: "fastfleets360", vehicle_type: "bike", updated_at: new Date().toISOString() }).eq("id", rider.id);
  }

  const payload = {
    asset_code: assetCode,
    asset_type: "bicycle",
    status,
    operating_state: operatingState,
    operating_zone: operatingZone || null,
    assigned_rider_profile_id: assignedRiderProfileId || null,
    assigned_user_id: assignedUserId,
    ...(status === "busy" ? {} : { current_delivery_id: null }),
    notes: notes || null,
    updated_at: new Date().toISOString()
  };

  const query = editing
    ? supabase.from("fleet_assets").update(payload).eq("id", id)
    : supabase.from("fleet_assets").insert(payload);

  const { data, error } = await query.select(assetSelect).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ fleetAsset: data });
}

function normalizeStatus(value: unknown): FleetAssetStatus {
  const status = text(value).toLowerCase();
  return assetStatuses.has(status) ? (status as FleetAssetStatus) : "available";
}

function text(value: unknown) {
  return String(value || "").trim();
}
