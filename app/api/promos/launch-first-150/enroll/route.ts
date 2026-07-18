import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ensureLaunchPromoEnrollment } from "@/lib/promos/launch-first-150";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Sign in to enroll in the launch promo." }, { status: 401 });
  }
  const limited = await enforceRateLimit(request, rateLimitPolicies.promoEnroll);
  if (limited) return limited;

  const status = await ensureLaunchPromoEnrollment(createAdminClient() || supabase, user.id);
  return NextResponse.json({
    enrolled: Boolean(status?.enrolled),
    enrollmentRank: status?.enrollmentRank ?? null,
    remainingRedemptions: status?.remainingRedemptions ?? 0
  });
}
