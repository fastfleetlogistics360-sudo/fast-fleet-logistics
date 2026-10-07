import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { referralLink } from "@/lib/referrals";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to view Refer & Win." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Refer & Win is temporarily unavailable." }, { status: 503 });
  const { data: codeData, error: codeError } = await db.rpc("ensure_referral_code", { target_user_id: user.id });
  if (codeError || typeof codeData !== "string") return NextResponse.json({ error: "Could not create your referral code." }, { status: 500 });
  const [campaignResult, rewardResult, referralResult] = await Promise.all([
    db.from("referral_campaigns").select("id, slug, title, description, campaign_type, reward_amount_ngn, qualification_type").eq("is_active", true).order("created_at"),
    db.from("referral_rewards").select("id, referral_id, amount_ngn, status, pending_at, available_at, transferred_at, qualifying_activity_type, qualifying_activity_id, referral:referrals!inner(referred_user_id, campaign:referral_campaigns!inner(slug, title, campaign_type)), referred:users!referrals_referred_user_id_fkey(full_name)").eq("referrer_user_id", user.id).order("created_at", { ascending: false }).limit(100),
    db.from("referrals").select("id, campaign_id, referred_user_id").eq("referred_user_id", user.id).maybeSingle()
  ]);
  if (campaignResult.error || rewardResult.error) return NextResponse.json({ error: "Could not load your referral activity." }, { status: 500 });
  const cyclistReferralId = referralResult.data?.id || null;
  const { data: ownCyclistApplication } = await db.from("cyclist_applications").select("id, status, submitted_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const rewards = (rewardResult.data || []).map((reward) => {
    const referred = Array.isArray(reward.referred) ? reward.referred[0] : reward.referred;
    const referral = Array.isArray(reward.referral) ? reward.referral[0] : reward.referral;
    const campaign = referral?.campaign ? (Array.isArray(referral.campaign) ? referral.campaign[0] : referral.campaign) : null;
    return {
    id: reward.id,
    amountNgn: Number(reward.amount_ngn || 0),
    status: reward.status,
    pendingAt: reward.pending_at,
    availableAt: reward.available_at,
    transferredAt: reward.transferred_at,
    qualifyingActivityType: reward.qualifying_activity_type,
    referredName: firstName(referred?.full_name),
    campaign: campaign || null
  };
  });
  const totals = rewards.reduce((value, reward) => ({
    pending: value.pending + (reward.status === "pending" || reward.status === "held" ? reward.amountNgn : 0),
    available: value.available + (reward.status === "available" ? reward.amountNgn : 0),
    earned: value.earned + (reward.status === "available" || reward.status === "transferred" ? reward.amountNgn : 0)
  }), { pending: 0, available: 0, earned: 0 });
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    code: codeData,
    links: { customer: referralLink(origin, codeData, "customer_referral"), cyclist: referralLink(origin, codeData, "cyclist_referral") },
    campaigns: campaignResult.data || [],
    rewards,
    totals,
    cyclistApplication: ownCyclistApplication || null,
    attribution: cyclistReferralId
  });
}

function firstName(value: unknown) {
  const parts = typeof value === "string" ? value.trim().split(/\s+/).filter(Boolean) : [];
  return parts.length ? `${parts[0]}${parts[1] ? ` ${parts[1][0]}.` : ""}` : "New member";
}
