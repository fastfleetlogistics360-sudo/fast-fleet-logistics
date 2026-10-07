import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Referral operations are not configured." }, { status: 503 });
  const [campaigns, rewards] = await Promise.all([
    db.from("referral_campaigns").select("id, slug, title, campaign_type, reward_amount_ngn, qualification_type, is_active, starts_at, ends_at, updated_at").order("created_at"),
    db.from("referral_rewards").select("id, amount_ngn, status, pending_at, available_at, transferred_at, held_at, reversed_at, held_reason, reversal_reason, referral:referrals!inner(id, attributed_at, status, qualifying_activity_type, qualifying_activity_id, referrer:users!referrals_referrer_user_id_fkey(full_name, email), referred:users!referrals_referred_user_id_fkey(full_name, email), campaign:referral_campaigns!inner(title, slug, campaign_type))").order("created_at", { ascending: false }).limit(200)
  ]);
  if (campaigns.error || rewards.error) return NextResponse.json({ error: campaigns.error?.message || rewards.error?.message || "Could not load referral operations." }, { status: 500 });
  return NextResponse.json({ campaigns: campaigns.data || [], rewards: rewards.data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Referral operations are not configured." }, { status: 503 });
  if (body.kind === "campaign") {
    const id = text(body.id);
    const amount = Number(body.rewardAmountNgn);
    if (!id || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid campaign reward amount." }, { status: 400 });
    const { data, error } = await db.from("referral_campaigns").update({ is_active: body.isActive === true, reward_amount_ngn: Math.round(amount), starts_at: nullableText(body.startsAt), ends_at: nullableText(body.endsAt) }).eq("id", id).select("id, slug, is_active, reward_amount_ngn, starts_at, ends_at").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ campaign: data });
  }
  const rewardId = text(body.rewardId);
  const action = text(body.action);
  const reason = text(body.reason);
  if (!rewardId || !["hold", "release", "reverse"].includes(action)) return NextResponse.json({ error: "Choose a referral reward action." }, { status: 400 });
  if ((action === "hold" || action === "reverse") && reason.length < 4) return NextResponse.json({ error: "Add an audit reason for this action." }, { status: 400 });
  const patch = action === "hold"
    ? { status: "held", held_at: new Date().toISOString(), held_by: admin.userId, held_reason: reason }
    : action === "release"
      ? { status: "available", available_at: new Date().toISOString(), held_at: null, held_by: null, held_reason: null }
      : { status: "reversed", reversed_at: new Date().toISOString(), reversed_by: admin.userId, reversal_reason: reason };
  const { data, error } = await db.from("referral_rewards").update(patch).eq("id", rewardId).in("status", action === "release" ? ["held"] : ["pending", "available", "held"]).select("id, status").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "That reward cannot be changed in its current state." }, { status: 409 });
  return NextResponse.json({ reward: data });
}

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function nullableText(value: unknown) { const result = text(value); return result || null; }
