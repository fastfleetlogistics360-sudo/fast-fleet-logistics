import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { defaultHubPromotionSlides, enabledHubPromotionSlides, hubPromotionSlidesSettingsKey, normalizeHubPromotionSlides, type HubPromotionSlide } from "@/lib/hub-promotion-slides";
import type { Json } from "@/lib/supabase/types";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ slides: defaultHubPromotionSlides, demo: true });
    return NextResponse.json(missingServiceResponse("Hub promotions"), { status: 503 });
  }

  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", hubPromotionSlidesSettingsKey).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ slides: normalizeHubPromotionSlides(data?.value || defaultHubPromotionSlides) });
}

export async function PUT(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const slides = normalizeHubPromotionSlides(body.slides);
  const notifyUsers = body.notifyUsers === true;
  const promotionId = typeof body.promotionId === "string" ? body.promotionId.trim() : "";
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save Hub promotions." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("platform_settings")
    .upsert({ key: hubPromotionSlidesSettingsKey, value: slides as unknown as Json, updated_at: new Date().toISOString() }, { onConflict: "key" })
    .select("value")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const savedSlides = normalizeHubPromotionSlides(data.value);
  const notification = notifyUsers ? await notifyPromotionSubscribers(supabase, savedSlides, promotionId) : null;
  return NextResponse.json({ slides: savedSlides, notification });
}

async function notifyPromotionSubscribers(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  slides: HubPromotionSlide[],
  promotionId: string
) {
  const promotion = enabledHubPromotionSlides(slides).find((slide) => slide.id === promotionId);
  if (!promotion) {
    return { notificationCount: 0, skippedReason: "Choose the enabled Hub promotion you want to notify users about." };
  }

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("user_id")
    .limit(5000);

  if (error) {
    return { notificationCount: 0, skippedReason: `Push subscriber lookup failed: ${error.message}` };
  }

  const userIds = Array.from(new Set((data || []).map((row) => String(row.user_id || "")).filter(Boolean)));
  if (!userIds.length) {
    return { notificationCount: 0, skippedReason: "No subscribed users were found." };
  }

  const url = safeNotificationUrl(promotion.href);
  const results = await Promise.allSettled(
    userIds.map((userId) =>
      insertNotificationWithPush(supabase, {
        user_id: userId,
        title: promotion.title,
        body: promotion.description || promotion.badgeText || "New Fast Fleets 360 promotion is live.",
        type: "promotion",
        metadata: {
          promotion_id: promotion.id,
          badge: promotion.badgeText,
          url,
          tag: `ff-promo-${promotion.id}`
        }
      })
    )
  );

  const notificationCount = results.filter((result) => result.status === "fulfilled" && !result.value.error).length;
  const push = results.reduce(
    (summary, result) => {
      if (result.status !== "fulfilled" || !result.value.push) return summary;
      const attempt = result.value.push;
      summary.accepted += attempt.accepted;
      summary.attempted += attempt.attempted;
      summary.failed += attempt.failed;
      summary.fcmAttempted += attempt.fcm.attempted;
      summary.fcmAccepted += attempt.fcm.accepted;
      summary.fcmFailed += attempt.fcm.failed;
      return summary;
    },
    { accepted: 0, attempted: 0, failed: 0, fcmAttempted: 0, fcmAccepted: 0, fcmFailed: 0 }
  );
  return { notificationCount, promotionId: promotion.id, promotionTitle: promotion.title, push };
}

function safeNotificationUrl(value: string) {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/updates";
}
