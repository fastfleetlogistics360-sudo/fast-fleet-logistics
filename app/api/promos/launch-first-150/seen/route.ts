import { NextResponse } from "next/server";
import { markLaunchPromoAnnouncementSeen } from "@/lib/promos/launch-first-150";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.promoSeen);
  if (limited) return limited;

  const admin = createAdminClient();
  const saved = await markLaunchPromoAnnouncementSeen(admin || supabase, user.id);
  return NextResponse.json({ ok: saved });
}
