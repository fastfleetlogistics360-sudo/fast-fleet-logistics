import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const modes = new Set(["standard", "bicycle_application"]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to choose your rider onboarding path." }, { status: 401 });

  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadKycSubmit);
  if (limited) return limited;

  const body = await request.json().catch(() => ({})) as { mode?: unknown };
  const mode = typeof body.mode === "string" ? body.mode.trim() : "";
  if (!modes.has(mode)) return NextResponse.json({ error: "Choose a valid rider onboarding path." }, { status: 400 });

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Rider onboarding is temporarily unavailable." }, { status: 503 });
  const [{ data: account }, { data: riderProfile }] = await Promise.all([
    db.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>(),
    db.from("rider_profiles").select("application_status").eq("user_id", user.id).maybeSingle<{ application_status?: string | null }>()
  ]);
  if (account?.account_type !== "rider") return NextResponse.json({ error: "Create or switch to a Rider account before starting this application." }, { status: 403 });
  if (riderProfile?.application_status === "approved") return NextResponse.json({ error: "Your rider account is already approved." }, { status: 409 });

  const { error } = await db.from("profiles").update({ rider_onboarding_path: mode, updated_at: new Date().toISOString() }).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ mode });
}
