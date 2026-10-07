import { NextResponse } from "next/server";
import { submitCyclistRiderApplication } from "@/lib/cyclist-rider-application";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to apply as a cyclist." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadKycSubmit);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Cyclist applications are temporarily unavailable." }, { status: 503 });
  const { data: account } = await db.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  if (account?.account_type !== "rider") return NextResponse.json({ error: "Create or switch to a Rider account before applying as a bicycle rider." }, { status: 403 });
  const result = await submitCyclistRiderApplication(db, user.id, await request.json().catch(() => ({})));
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.error.includes("already") || result.error.includes("in progress") ? 409 : 400 });
  return NextResponse.json({ application: result.application }, { status: 201 });
}
