import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { syncLaunchPromoEnrollments } from "@/lib/promos/launch-first-150";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

const campaignKey = "launch_first_150";

const demoReport = {
  campaign: {
    key: campaignKey,
    title: "First 150 FastFleets 360 users",
    status: "active",
    enrollment_limit: 150,
    max_redemptions_per_user: 2,
    discount_percent: 50,
    discount_cap_ngn: 1500,
    waive_platform_fee: true
  },
  enrollments: [],
  redemptions: [],
  walletFunding: [],
  summary: {
    enrolled: 0,
    activeEnrollments: 0,
    redeemedCount: 0,
    pendingRedemptions: 0,
    voidRedemptions: 0,
    totalDiscountNgn: 0,
    sandboxFundingNgn: 0,
    liveFundingNgn: 0,
    unknownFundingNgn: 0
  }
};

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ ...demoReport, demo: true });
    return NextResponse.json(missingServiceResponse("promo reporting"), { status: 503 });
  }

  const sync = await syncLaunchPromoEnrollments(supabase);
  const [campaignResult, enrollmentResult, redemptionResult, fundingResult] = await Promise.all([
    supabase
      .from("promo_campaigns")
      .select("key, title, status, enrollment_limit, max_redemptions_per_user, discount_percent, discount_cap_ngn, waive_platform_fee, starts_at, ends_at, metadata, created_at, updated_at")
      .eq("key", campaignKey)
      .maybeSingle(),
    supabase
      .from("promo_enrollments")
      .select("id, campaign_key, user_id, enrollment_rank, status, announcement_seen_at, redemption_count, metadata, created_at, updated_at")
      .eq("campaign_key", campaignKey)
      .order("created_at", { ascending: true })
      .limit(300),
    supabase
      .from("promo_redemptions")
      .select("id, campaign_key, user_id, delivery_id, redemption_slot, status, original_total_ngn, final_total_ngn, delivery_discount_ngn, platform_fee_discount_ngn, total_discount_ngn, redeemed_at, voided_at, metadata, created_at, updated_at")
      .eq("campaign_key", campaignKey)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase
      .from("transactions")
      .select("id, wallet_id, amount_ngn, status, provider, provider_reference, metadata, created_at")
      .eq("transaction_type", "wallet_funding")
      .order("created_at", { ascending: false })
      .limit(1000)
  ]);

  const firstError = [campaignResult.error, enrollmentResult.error, redemptionResult.error, fundingResult.error].find(Boolean);
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 400 });

  const enrollments = [...(enrollmentResult.data || [])].sort((a, b) => {
    const left = rankValue(a.enrollment_rank);
    const right = rankValue(b.enrollment_rank);
    if (left !== right) return left - right;
    return Date.parse(String(a.created_at || "")) - Date.parse(String(b.created_at || ""));
  });
  const redemptions = redemptionResult.data || [];
  const fundingRows = fundingResult.data || [];
  const walletIds = unique(fundingRows.map((row) => row.wallet_id).filter(Boolean));
  const deliveryIds = unique(redemptions.map((row) => row.delivery_id).filter(Boolean));

  const [walletResult, deliveryResult] = await Promise.all([
    walletIds.length
      ? supabase
          .from("wallets")
          .select("id, user_id, wallet_type, balance_ngn, locked_balance_ngn")
          .in("id", walletIds)
      : Promise.resolve({ data: [], error: null }),
    deliveryIds.length
      ? supabase
          .from("deliveries")
          .select("id, delivery_code, status, price_ngn, created_at")
          .in("id", deliveryIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (walletResult.error) return NextResponse.json({ error: walletResult.error.message }, { status: 400 });
  if (deliveryResult.error) return NextResponse.json({ error: deliveryResult.error.message }, { status: 400 });

  const wallets = walletResult.data || [];
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));
  const userIds = unique([
    ...enrollments.map((row) => row.user_id),
    ...redemptions.map((row) => row.user_id),
    ...wallets.map((wallet) => wallet.user_id)
  ].filter(Boolean));
  const userResult = userIds.length
    ? await supabase
        .from("users")
        .select("id, full_name, email, phone, role, created_at")
        .in("id", userIds)
    : { data: [], error: null };

  if (userResult.error) return NextResponse.json({ error: userResult.error.message }, { status: 400 });

  const userById = new Map((userResult.data || []).map((user) => [user.id, user]));
  const deliveryById = new Map((deliveryResult.data || []).map((delivery) => [delivery.id, delivery]));
  const enrichedEnrollments = enrollments.map((row) => ({ ...row, users: userById.get(row.user_id) || null }));
  const enrichedRedemptions = redemptions.map((row) => ({
    ...row,
    users: userById.get(row.user_id) || null,
    deliveries: row.delivery_id ? deliveryById.get(row.delivery_id) || null : null
  }));
  const walletFunding = fundingRows.map((row) => {
    const wallet = walletById.get(row.wallet_id);
    return {
      ...row,
      payment_environment: paymentEnvironment(row.metadata),
      wallet,
      users: wallet?.user_id ? userById.get(wallet.user_id) || null : null
    };
  });

  return NextResponse.json({
    campaign: campaignResult.data || null,
    enrollments: enrichedEnrollments,
    redemptions: enrichedRedemptions,
    walletFunding,
    sync,
    summary: buildSummary(enrichedEnrollments, enrichedRedemptions, walletFunding)
  });
}

function buildSummary(enrollments: any[], redemptions: any[], walletFunding: any[]) {
  const successfulFunding = walletFunding.filter((row) => row.status === "successful");
  return {
    enrolled: enrollments.length,
    activeEnrollments: enrollments.filter((row) => row.status === "active").length,
    redeemedCount: redemptions.filter((row) => row.status === "redeemed").length,
    pendingRedemptions: redemptions.filter((row) => row.status === "pending").length,
    voidRedemptions: redemptions.filter((row) => row.status === "void").length,
    totalDiscountNgn: sum(redemptions.filter((row) => row.status !== "void"), "total_discount_ngn"),
    sandboxFundingNgn: sum(successfulFunding.filter((row) => row.payment_environment === "sandbox"), "amount_ngn"),
    liveFundingNgn: sum(successfulFunding.filter((row) => row.payment_environment === "live"), "amount_ngn"),
    unknownFundingNgn: sum(successfulFunding.filter((row) => row.payment_environment !== "sandbox" && row.payment_environment !== "live"), "amount_ngn")
  };
}

function paymentEnvironment(metadata: unknown) {
  const record = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
  const value = String(record.payment_environment || record.squad_environment || "").trim().toLowerCase();
  if (value === "sandbox" || value === "live") return value;
  return "unknown_legacy";
}

function rankValue(value: unknown) {
  const rank = Number(value);
  return Number.isFinite(rank) && rank > 0 ? rank : Number.MAX_SAFE_INTEGER;
}

function sum(rows: any[], key: string) {
  return rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}
