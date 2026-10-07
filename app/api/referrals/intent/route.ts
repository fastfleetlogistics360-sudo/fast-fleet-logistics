import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cleanReferralCode, referralCampaignFromInput, referralIntentValue, REFERRAL_COOKIE, REFERRAL_COOKIE_MAX_AGE_SECONDS } from "@/lib/referrals";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.promoEnroll);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const code = cleanReferralCode((body as { code?: unknown }).code);
  const campaign = referralCampaignFromInput((body as { campaign?: unknown }).campaign);
  if (!code || !campaign) return NextResponse.json({ error: "This referral link is invalid." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Referral links are temporarily unavailable." }, { status: 503 });
  const [{ data: referralCode }, { data: referralCampaign }] = await Promise.all([
    db.from("referral_codes").select("id").eq("code", code).eq("is_active", true).maybeSingle(),
    db.from("referral_campaigns").select("id").eq("slug", campaign).eq("is_active", true).or("starts_at.is.null,starts_at.lte." + new Date().toISOString()).or("ends_at.is.null,ends_at.gt." + new Date().toISOString()).maybeSingle()
  ]);
  if (!referralCode || !referralCampaign) return NextResponse.json({ error: "This referral link is no longer available." }, { status: 404 });
  const { data: intent, error } = await db.from("referral_attribution_intents").insert({ referral_code_id: referralCode.id, campaign_id: referralCampaign.id, expires_at: new Date(Date.now() + REFERRAL_COOKIE_MAX_AGE_SECONDS * 1000).toISOString() }).select("id").single();
  if (error || !intent?.id) return NextResponse.json({ error: "Could not save this referral invitation." }, { status: 500 });
  const response = NextResponse.json({ ok: true, campaign });
  response.cookies.set(REFERRAL_COOKIE, referralIntentValue(intent.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFERRAL_COOKIE_MAX_AGE_SECONDS
  });
  return response;
}
