import type { DeliveryQuote } from "@/lib/delivery-quotes";

export const launchFirst150CampaignKey = "launch_first_150";

export const launchFirst150Promo = {
  key: launchFirst150CampaignKey,
  title: "First 150 FastFleets 360 users",
  enrollmentLimit: 150,
  maxRedemptionsPerUser: 2,
  discountPercent: 50,
  discountCapNgn: 1500,
  waivePlatformFee: true
} as const;

type SupabaseLike = {
  from: (table: string) => any;
};

type CampaignRow = {
  key: string;
  title?: string | null;
  status?: string | null;
  enrollment_limit?: number | string | null;
  max_redemptions_per_user?: number | string | null;
  discount_percent?: number | string | null;
  discount_cap_ngn?: number | string | null;
  waive_platform_fee?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

type EnrollmentRow = {
  id: string;
  user_id: string;
  campaign_key: string;
  enrollment_rank?: number | string | null;
  status?: string | null;
  announcement_seen_at?: string | null;
  redemption_count?: number | string | null;
};

export type LaunchPromoStatus = {
  configured: boolean;
  enrolled: boolean;
  campaignKey: string;
  title: string;
  enrollmentLimit: number;
  maxRedemptions: number;
  remainingRedemptions: number;
  redemptionCount: number;
  announcementSeen: boolean;
  enrollmentRank: number | null;
};

export type LaunchPromoQuote = {
  campaignKey: string;
  title: string;
  applied: boolean;
  eligible: boolean;
  reason: string | null;
  originalDeliveryFee: number;
  originalPlatformFee: number;
  originalTotal: number;
  deliveryDiscount: number;
  platformFeeDiscount: number;
  totalDiscount: number;
  deliveryFee: number;
  platformFee: number;
  total: number;
  remainingRedemptions: number;
  maxRedemptions: number;
  discountPercent: number;
  discountCapNgn: number;
};

export type LaunchPromoAnnouncement = {
  campaignKey: string;
  title: string;
  remainingRedemptions: number;
  maxRedemptions: number;
  discountPercent: number;
  discountCapNgn: number;
  enrollmentRank: number | null;
};

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nowMs(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isMissingPromoTable(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  return code === "42P01" || code === "PGRST205";
}

function dbClient(db: SupabaseLike) {
  return db as any;
}

async function loadCampaign(db: SupabaseLike): Promise<CampaignRow | null> {
  const { data, error } = await dbClient(db)
    .from("promo_campaigns")
    .select("key, title, status, enrollment_limit, max_redemptions_per_user, discount_percent, discount_cap_ngn, waive_platform_fee, starts_at, ends_at")
    .eq("key", launchFirst150CampaignKey)
    .maybeSingle();

  if (error) {
    if (isMissingPromoTable(error)) return null;
    throw error;
  }

  return data || null;
}

function normalizeCampaign(campaign: CampaignRow | null) {
  const now = Date.now();
  const startsAt = nowMs(campaign?.starts_at);
  const endsAt = nowMs(campaign?.ends_at);
  const active =
    Boolean(campaign) &&
    String(campaign?.status || "active") === "active" &&
    (!startsAt || startsAt <= now) &&
    (!endsAt || endsAt >= now);

  return {
    active,
    title: String(campaign?.title || launchFirst150Promo.title),
    enrollmentLimit: Math.max(1, Math.round(numberValue(campaign?.enrollment_limit, launchFirst150Promo.enrollmentLimit))),
    maxRedemptions: Math.max(1, Math.round(numberValue(campaign?.max_redemptions_per_user, launchFirst150Promo.maxRedemptionsPerUser))),
    discountPercent: Math.min(100, Math.max(0, numberValue(campaign?.discount_percent, launchFirst150Promo.discountPercent))),
    discountCapNgn: Math.max(0, Math.round(numberValue(campaign?.discount_cap_ngn, launchFirst150Promo.discountCapNgn))),
    waivePlatformFee: campaign?.waive_platform_fee ?? launchFirst150Promo.waivePlatformFee
  };
}

async function loadEnrollment(db: SupabaseLike, userId: string): Promise<EnrollmentRow | null> {
  const { data, error } = await dbClient(db)
    .from("promo_enrollments")
    .select("id, user_id, campaign_key, enrollment_rank, status, announcement_seen_at, redemption_count")
    .eq("campaign_key", launchFirst150CampaignKey)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isMissingPromoTable(error)) return null;
    throw error;
  }

  return data || null;
}

async function rankUserForPromo(db: SupabaseLike, userId: string, limit: number) {
  const { data, error } = await dbClient(db)
    .from("users")
    .select("id")
    .neq("role", "admin")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw error;
  const index = (data || []).findIndex((user: { id?: string | null }) => user.id === userId);
  return index >= 0 ? index + 1 : null;
}

async function countRedemptions(db: SupabaseLike, userId: string, statuses: Array<"pending" | "redeemed" | "void">) {
  const { count, error } = await dbClient(db)
    .from("promo_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("campaign_key", launchFirst150CampaignKey)
    .eq("user_id", userId)
    .in("status", statuses);

  if (error) {
    if (isMissingPromoTable(error)) return 0;
    throw error;
  }

  return count || 0;
}

async function countRedeemed(db: SupabaseLike, userId: string) {
  return countRedemptions(db, userId, ["redeemed"]);
}

async function countHeldSlots(db: SupabaseLike, userId: string) {
  return countRedemptions(db, userId, ["pending", "redeemed"]);
}

export async function getLaunchPromoStatus(db: SupabaseLike, userId: string, options: { enroll?: boolean } = {}): Promise<LaunchPromoStatus | null> {
  if (!userId) return null;

  try {
    const campaign = normalizeCampaign(await loadCampaign(db));
    if (!campaign.active) return null;

    let enrollment = await loadEnrollment(db, userId);
    if (!enrollment && options.enroll !== false) {
      const rank = await rankUserForPromo(db, userId, campaign.enrollmentLimit);
      if (rank) {
        const { data, error } = await dbClient(db)
          .from("promo_enrollments")
          .upsert(
            {
              campaign_key: launchFirst150CampaignKey,
              user_id: userId,
              enrollment_rank: rank,
              status: "active"
            },
            { onConflict: "campaign_key,user_id" }
          )
          .select("id, user_id, campaign_key, enrollment_rank, status, announcement_seen_at, redemption_count")
          .single();
        if (error) {
          if (isMissingPromoTable(error)) return null;
          throw error;
        }
        enrollment = data;
      }
    }

    if (!enrollment || String(enrollment.status || "active") !== "active") return null;
    const redemptionCount = await countRedeemed(db, userId);
    const heldCount = await countHeldSlots(db, userId);
    if (numberValue(enrollment.redemption_count, 0) !== redemptionCount) {
      await dbClient(db)
        .from("promo_enrollments")
        .update({ redemption_count: redemptionCount, updated_at: new Date().toISOString() })
        .eq("id", enrollment.id);
    }

    return {
      configured: true,
      enrolled: true,
      campaignKey: launchFirst150CampaignKey,
      title: campaign.title,
      enrollmentLimit: campaign.enrollmentLimit,
      maxRedemptions: campaign.maxRedemptions,
      remainingRedemptions: Math.max(0, campaign.maxRedemptions - heldCount),
      redemptionCount,
      announcementSeen: Boolean(enrollment.announcement_seen_at),
      enrollmentRank: enrollment.enrollment_rank === null || enrollment.enrollment_rank === undefined ? null : Math.round(numberValue(enrollment.enrollment_rank))
    };
  } catch {
    return null;
  }
}

export async function ensureLaunchPromoEnrollment(db: SupabaseLike, userId: string): Promise<LaunchPromoStatus | null> {
  return getLaunchPromoStatus(db, userId, { enroll: true });
}

export async function syncLaunchPromoEnrollments(db: SupabaseLike) {
  try {
    const campaign = normalizeCampaign(await loadCampaign(db));
    if (!campaign.active) {
      return { synced: false, eligible: 0, inserted: 0, reason: "inactive_campaign" };
    }

    const { data: users, error: usersError } = await dbClient(db)
      .from("users")
      .select("id")
      .neq("role", "admin")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(campaign.enrollmentLimit);
    if (usersError) throw usersError;

    const eligibleUsers = (users || []).filter((user: { id?: string | null }) => Boolean(user.id));
    const eligibleIds = eligibleUsers.map((user: { id?: string | null }) => String(user.id));
    if (eligibleIds.length === 0) {
      return { synced: true, eligible: 0, inserted: 0 };
    }

    const { data: existing, error: existingError } = await dbClient(db)
      .from("promo_enrollments")
      .select("user_id")
      .eq("campaign_key", launchFirst150CampaignKey)
      .in("user_id", eligibleIds);
    if (existingError) {
      if (isMissingPromoTable(existingError)) return { synced: false, eligible: eligibleIds.length, inserted: 0, reason: "missing_table" };
      throw existingError;
    }

    const existingIds = new Set((existing || []).map((row: { user_id?: string | null }) => row.user_id).filter(Boolean));
    const rows = eligibleUsers
      .map((user: { id?: string | null }, index: number) => ({
        campaign_key: launchFirst150CampaignKey,
        user_id: String(user.id),
        enrollment_rank: index + 1,
        status: "active"
      }))
      .filter((row: { user_id: string }) => !existingIds.has(row.user_id));

    if (rows.length === 0) {
      return { synced: true, eligible: eligibleIds.length, inserted: 0 };
    }

    const { error: insertError } = await dbClient(db)
      .from("promo_enrollments")
      .upsert(rows, { onConflict: "campaign_key,user_id" });
    if (insertError) {
      if (isMissingPromoTable(insertError)) return { synced: false, eligible: eligibleIds.length, inserted: 0, reason: "missing_table" };
      throw insertError;
    }

    return { synced: true, eligible: eligibleIds.length, inserted: rows.length };
  } catch {
    return { synced: false, eligible: 0, inserted: 0, reason: "sync_failed" };
  }
}

export async function getLaunchPromoAnnouncement(db: SupabaseLike, userId: string): Promise<LaunchPromoAnnouncement | null> {
  const status = await getLaunchPromoStatus(db, userId, { enroll: true });
  if (!status?.enrolled || status.announcementSeen || status.remainingRedemptions <= 0) return null;
  return {
    campaignKey: status.campaignKey,
    title: status.title,
    remainingRedemptions: status.remainingRedemptions,
    maxRedemptions: status.maxRedemptions,
    discountPercent: launchFirst150Promo.discountPercent,
    discountCapNgn: launchFirst150Promo.discountCapNgn,
    enrollmentRank: status.enrollmentRank
  };
}

export async function markLaunchPromoAnnouncementSeen(db: SupabaseLike, userId: string) {
  const status = await getLaunchPromoStatus(db, userId, { enroll: true });
  if (!status?.enrolled) return false;
  const { error } = await dbClient(db)
    .from("promo_enrollments")
    .update({ announcement_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("campaign_key", launchFirst150CampaignKey)
    .eq("user_id", userId);
  return !error;
}

export async function quoteLaunchDeliveryPromo(db: SupabaseLike, userId: string, quote: DeliveryQuote): Promise<LaunchPromoQuote> {
  const campaign = normalizeCampaign(await loadCampaign(db).catch(() => null));
  const originalDeliveryFee = Math.max(0, Math.round(numberValue(quote.fare.deliveryFee)));
  const originalPlatformFee = Math.max(0, Math.round(numberValue(quote.fare.platformFee)));
  const originalTotal = Math.max(0, Math.round(numberValue(quote.fare.total, originalDeliveryFee + originalPlatformFee)));
  const baseQuote = {
    campaignKey: launchFirst150CampaignKey,
    title: campaign.title,
    originalDeliveryFee,
    originalPlatformFee,
    originalTotal,
    deliveryDiscount: 0,
    platformFeeDiscount: 0,
    totalDiscount: 0,
    deliveryFee: originalDeliveryFee,
    platformFee: originalPlatformFee,
    total: originalTotal,
    remainingRedemptions: 0,
    maxRedemptions: campaign.maxRedemptions,
    discountPercent: campaign.discountPercent,
    discountCapNgn: campaign.discountCapNgn
  };

  if (!campaign.active) {
    return { ...baseQuote, applied: false, eligible: false, reason: "Launch promo is not active." };
  }
  if (!userId) {
    return { ...baseQuote, applied: false, eligible: false, reason: "Sign in to use the launch promo." };
  }

  const status = await getLaunchPromoStatus(db, userId, { enroll: true });
  if (!status?.enrolled) {
    return { ...baseQuote, applied: false, eligible: false, reason: "This account is outside the first 150 launch slots." };
  }
  if (status.remainingRedemptions <= 0) {
    return { ...baseQuote, applied: false, eligible: false, remainingRedemptions: 0, reason: "Launch promo already used." };
  }
  if (!quote.bicycleEligible || quote.vehicleSubtype !== "bicycle") {
    return {
      ...baseQuote,
      applied: false,
      eligible: false,
      remainingRedemptions: status.remainingRedemptions,
      reason: "Choose an eligible bike-size delivery to use this launch promo."
    };
  }

  const deliveryDiscount = Math.min(
    campaign.discountCapNgn,
    Math.round((originalDeliveryFee * campaign.discountPercent) / 100)
  );
  const platformFeeDiscount = campaign.waivePlatformFee ? originalPlatformFee : 0;
  const totalDiscount = Math.min(originalTotal, deliveryDiscount + platformFeeDiscount);
  const deliveryFee = Math.max(0, originalDeliveryFee - deliveryDiscount);
  const platformFee = Math.max(0, originalPlatformFee - platformFeeDiscount);
  const total = Math.max(0, originalTotal - totalDiscount);

  return {
    ...baseQuote,
    applied: totalDiscount > 0,
    eligible: true,
    reason: null,
    deliveryDiscount,
    platformFeeDiscount,
    totalDiscount,
    deliveryFee,
    platformFee,
    total,
    remainingRedemptions: status.remainingRedemptions
  };
}

export function launchPromoMetadata(promo: LaunchPromoQuote | null) {
  if (!promo?.applied) return null;
  return {
    campaign_key: promo.campaignKey,
    campaign_title: promo.title,
    original_total_ngn: promo.originalTotal,
    original_delivery_fee_ngn: promo.originalDeliveryFee,
    original_platform_fee_ngn: promo.originalPlatformFee,
    payable_total_ngn: promo.total,
    discounted_delivery_fee_ngn: promo.deliveryFee,
    discounted_platform_fee_ngn: promo.platformFee,
    delivery_discount_ngn: promo.deliveryDiscount,
    platform_fee_discount_ngn: promo.platformFeeDiscount,
    total_discount_ngn: promo.totalDiscount,
    discount_percent: promo.discountPercent,
    discount_cap_ngn: promo.discountCapNgn
  };
}

async function loadPromoDelivery(db: SupabaseLike, deliveryId: string) {
  if (!deliveryId) return null;

  const { data: delivery, error } = await dbClient(db)
    .from("deliveries")
    .select("id, delivery_code, customer_id, price_ngn, delivery_fee_ngn, platform_fee_ngn, metadata")
    .eq("id", deliveryId)
    .maybeSingle();
  if (error || !delivery?.customer_id) return null;

  const metadata = delivery.metadata && typeof delivery.metadata === "object" && !Array.isArray(delivery.metadata) ? delivery.metadata as Record<string, unknown> : {};
  const promo = metadata.launch_promo && typeof metadata.launch_promo === "object" && !Array.isArray(metadata.launch_promo)
    ? metadata.launch_promo as Record<string, unknown>
    : null;
  if (!promo || String(promo.campaign_key || "") !== launchFirst150CampaignKey) return null;
  return { delivery, promoDetails: promo };
}

async function updateEnrollmentRedemptionCount(db: SupabaseLike, userId: string) {
  const redeemedCount = await countRedeemed(db, userId);
  await dbClient(db)
    .from("promo_enrollments")
    .update({ redemption_count: redeemedCount, updated_at: new Date().toISOString() })
    .eq("campaign_key", launchFirst150CampaignKey)
    .eq("user_id", userId);
  return redeemedCount;
}

async function usedRedemptionSlots(db: SupabaseLike, userId: string) {
  const { data } = await dbClient(db)
    .from("promo_redemptions")
    .select("redemption_slot")
    .eq("campaign_key", launchFirst150CampaignKey)
    .eq("user_id", userId)
    .in("status", ["pending", "redeemed"]);
  return new Set((data || []).map((row: { redemption_slot?: number | string | null }) => Math.round(numberValue(row.redemption_slot))).filter(Boolean));
}

async function insertPromoRedemption(db: SupabaseLike, input: {
  delivery: any;
  promoDetails: Record<string, unknown>;
  status: "pending" | "redeemed";
  maxRedemptions: number;
}) {
  const used = await usedRedemptionSlots(db, input.delivery.customer_id);

  for (let slot = 1; slot <= input.maxRedemptions; slot += 1) {
    if (used.has(slot)) continue;
    const { error: insertError } = await dbClient(db).from("promo_redemptions").insert({
      campaign_key: launchFirst150CampaignKey,
      user_id: input.delivery.customer_id,
      delivery_id: input.delivery.id,
      redemption_slot: slot,
      status: input.status,
      redeemed_at: input.status === "redeemed" ? new Date().toISOString() : null,
      original_total_ngn: numberValue(input.promoDetails.original_total_ngn, numberValue(input.delivery.price_ngn)),
      final_total_ngn: numberValue(input.promoDetails.payable_total_ngn, numberValue(input.delivery.price_ngn)),
      delivery_discount_ngn: numberValue(input.promoDetails.delivery_discount_ngn),
      platform_fee_discount_ngn: numberValue(input.promoDetails.platform_fee_discount_ngn),
      total_discount_ngn: numberValue(input.promoDetails.total_discount_ngn),
      metadata: {
        delivery_code: input.delivery.delivery_code,
        original_delivery_fee_ngn: input.promoDetails.original_delivery_fee_ngn,
        original_platform_fee_ngn: input.promoDetails.original_platform_fee_ngn
      }
    });

    if (!insertError) return true;
    if (String(insertError.code || "") !== "23505") return false;
  }

  return false;
}

export async function reserveLaunchDeliveryPromo(db: SupabaseLike, deliveryId: string) {
  const loaded = await loadPromoDelivery(db, deliveryId);
  if (!loaded) return { reserved: false };
  const { delivery, promoDetails } = loaded;

  const status = await getLaunchPromoStatus(db, delivery.customer_id, { enroll: true });
  if (!status?.enrolled || status.remainingRedemptions <= 0) return { reserved: false };

  const { data: existing } = await dbClient(db)
    .from("promo_redemptions")
    .select("id, status")
    .eq("delivery_id", delivery.id)
    .maybeSingle();
  if (existing?.id) return { reserved: true };

  const inserted = await insertPromoRedemption(db, { delivery, promoDetails, status: "pending", maxRedemptions: status.maxRedemptions });
  await updateEnrollmentRedemptionCount(db, delivery.customer_id);
  return { reserved: inserted };
}

export async function voidLaunchDeliveryPromo(db: SupabaseLike, deliveryId: string, reason = "voided") {
  const { data: redemption } = await dbClient(db)
    .from("promo_redemptions")
    .select("id, user_id")
    .eq("delivery_id", deliveryId)
    .maybeSingle();
  if (!redemption?.id) return { voided: false };

  await dbClient(db)
    .from("promo_redemptions")
    .update({ status: "void", voided_at: new Date().toISOString(), metadata: { void_reason: reason }, updated_at: new Date().toISOString() })
    .eq("id", redemption.id);
  await updateEnrollmentRedemptionCount(db, redemption.user_id);
  return { voided: true };
}

export async function redeemLaunchDeliveryPromo(db: SupabaseLike, deliveryId: string) {
  const loaded = await loadPromoDelivery(db, deliveryId);
  if (!loaded) return { redeemed: false };
  const { delivery, promoDetails } = loaded;

  const status = await getLaunchPromoStatus(db, delivery.customer_id, { enroll: true });
  if (!status?.enrolled) return { redeemed: false };

  const { data: existing } = await dbClient(db)
    .from("promo_redemptions")
    .select("id, status")
    .eq("delivery_id", delivery.id)
    .maybeSingle();
  if (existing?.id) {
    if (existing.status !== "redeemed") {
      await dbClient(db)
        .from("promo_redemptions")
        .update({ status: "redeemed", redeemed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      await updateEnrollmentRedemptionCount(db, delivery.customer_id);
      return { redeemed: true };
    }
    return { redeemed: true };
  }

  const inserted = await insertPromoRedemption(db, { delivery, promoDetails, status: "redeemed", maxRedemptions: status.maxRedemptions });
  if (inserted) await updateEnrollmentRedemptionCount(db, delivery.customer_id);
  return { redeemed: inserted };
}
