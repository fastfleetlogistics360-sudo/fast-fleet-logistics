import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to transfer a referral reward." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.withdrawalRequest);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const rewardId = typeof (body as { rewardId?: unknown }).rewardId === "string" ? (body as { rewardId: string }).rewardId : "";
  if (!rewardId) return NextResponse.json({ error: "Choose an available referral reward." }, { status: 400 });
  const { data, error } = await supabase.rpc("transfer_referral_reward", { target_reward_id: rewardId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, transactionId: data });
}
