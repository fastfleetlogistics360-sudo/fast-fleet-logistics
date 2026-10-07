import { NextResponse } from "next/server";
import { submitCyclistRiderApplication, type CyclistApplicationRow } from "@/lib/cyclist-rider-application";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const applicationFields = "id, status, submitted_at, reviewed_at, approved_at, rider_activated_at, rejection_reason, residential_area, preferred_operating_zone, employment_preference, experience_notes";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to continue your bicycle rider application." }, { status: 401 });
  const db = createAdminClient() || supabase;
  const [{ data: account }, { data: riderProfile }, { data: application, error }] = await Promise.all([
    db.from("profiles").select("account_type, rider_onboarding_path").eq("user_id", user.id).maybeSingle<{ account_type?: string | null; rider_onboarding_path?: string | null }>(),
    db.from("rider_profiles").select("id, application_status, onboarding_path, rider_account_type, operating_zone, vehicle_type").eq("user_id", user.id).maybeSingle(),
    db.from("cyclist_applications").select(applicationFields).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<CyclistApplicationRow>()
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (account?.account_type !== "rider") return NextResponse.json({ error: "Create or switch to a Rider account before starting this application.", needsRiderAccount: true }, { status: 403 });
  return NextResponse.json({ application: application || null, riderProfile: riderProfile || null, onboardingPath: account?.rider_onboarding_path || null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to apply as a bicycle rider." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadKycSubmit);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Bicycle rider applications are temporarily unavailable." }, { status: 503 });
  const { data: account } = await db.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  if (account?.account_type !== "rider") return NextResponse.json({ error: "Create or switch to a Rider account before applying as a bicycle rider.", needsRiderAccount: true }, { status: 403 });
  const result = await submitCyclistRiderApplication(db, user.id, await request.json().catch(() => ({})));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error.includes("already") || result.error.includes("in progress") ? 409 : 400 });
  return NextResponse.json({ application: result.application }, { status: 201 });
}
