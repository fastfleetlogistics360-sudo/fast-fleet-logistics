import { NextResponse } from "next/server";
import { loadAssignedBicycleAsset } from "@/lib/fleet-assets";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to view your bicycle allocation." }, { status: 401 });
  const db = createAdminClient() || supabase;
  const { data: rider, error } = await db
    .from("rider_profiles")
    .select("id, application_status, onboarding_path")
    .eq("user_id", user.id)
    .maybeSingle<{ id?: string | null; application_status?: string | null; onboarding_path?: string | null }>();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!rider?.id || rider.onboarding_path !== "bicycle_application") return NextResponse.json({ bicycleApplicant: false, asset: null });

  const asset = await loadAssignedBicycleAsset(db, rider.id);
  let ownership = "Fast Fleets 360 company bicycle";
  if (asset?.id) {
    const { data: investorAssignment } = await db
      .from("investor_asset_assignments")
      .select("id")
      .eq("fleet_asset_id", asset.id)
      .is("ended_at", null)
      .limit(1)
      .maybeSingle();
    if (investorAssignment?.id) ownership = "Investor bicycle";
  }

  return NextResponse.json({
    bicycleApplicant: true,
    approved: rider.application_status === "approved",
    asset: asset
      ? {
          code: asset.asset_code || "Assigned bicycle",
          status: asset.status || "unknown",
          ownership,
          operatingState: asset.operating_state || null,
          operatingZone: asset.operating_zone || null
        }
      : null
  });
}
