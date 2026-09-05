import { NextResponse } from "next/server";
import { loadInvestorProfileForUser } from "@/lib/investors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    if (!user?.email_confirmed_at) return NextResponse.json({ error: "Verify your email before requesting a payout." }, { status: 403 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.authSensitive);
    if (limited) return limited;
    const amount = Math.round(Number((await request.json().catch(() => ({})) as { amountNgn?: unknown }).amountNgn || 0));
    const database = createAdminClient();
    if (!database) return NextResponse.json({ error: "Investor payouts are temporarily unavailable." }, { status: 503 });
    const investor = await loadInvestorProfileForUser(database, user.id);
    if (!investor || investor.status !== "active" || !investor.onboarding_completed_at) return NextResponse.json({ error: "Complete active investor onboarding before requesting a payout." }, { status: 403 });
    const { data, error } = await database.rpc("request_investor_withdrawal", { target_investor_profile_id: investor.id, requested_amount_ngn: amount, actor_user_id: user.id });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, withdrawalId: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request the investor payout." }, { status: 500 });
  }
}
