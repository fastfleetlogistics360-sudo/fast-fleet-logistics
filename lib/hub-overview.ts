import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledHubPromotionSlides, hubPromotionSlidesSettingsKey, type HubPromotionSlide } from "@/lib/hub-promotion-slides";
import { getLaunchPromoAnnouncement, type LaunchPromoAnnouncement } from "@/lib/promos/launch-first-150";
import { roleHome } from "@/lib/auth/roles";
import type { UserRole } from "@/types/domain";

export type HubGlance = {
  title: string;
  href: string;
  items: Array<{ label: string; value: string; helper: string }>;
};

export type HubOverview = {
  promotionSlides: HubPromotionSlide[];
  glance: HubGlance;
  launchPromo: LaunchPromoAnnouncement | null;
};

export async function loadHubOverview(supabase: SupabaseClient, userId: string, role: UserRole): Promise<HubOverview> {
  const admin = createAdminClient();
  const [promotionSlides, glance, launchPromo] = await Promise.all([
    loadHubPromotionSlides(),
    loadHubGlance(supabase, userId, role),
    getLaunchPromoAnnouncement(admin || supabase, userId)
  ]);

  return { promotionSlides, glance, launchPromo };
}

async function loadHubPromotionSlides(): Promise<HubPromotionSlide[]> {
  try {
    const admin = createAdminClient();
    if (!admin) return enabledHubPromotionSlides(null);
    const { data } = await admin.from("platform_settings").select("value").eq("key", hubPromotionSlidesSettingsKey).maybeSingle();
    return enabledHubPromotionSlides(data?.value);
  } catch {
    return enabledHubPromotionSlides(null);
  }
}

async function loadHubGlance(supabase: SupabaseClient, userId: string, role: UserRole): Promise<HubGlance> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const startOfToday = todayStart.toISOString();

  try {
    if (role === "rider") {
      const { data: rider } = await supabase.from("rider_profiles").select("id, rating").eq("user_id", userId).maybeSingle<{ id?: string | null; rating?: number | null }>();
      const { data: deliveries } = rider?.id
        ? await supabase.from("deliveries").select("status, price_ngn").eq("rider_id", rider.id).gte("created_at", startOfToday)
        : { data: [] as Array<{ status?: string | null; price_ngn?: number | null }> };
      const completed = (deliveries || []).filter((delivery) => delivery.status === "delivered");
      const earnings = completed.reduce((sum, delivery) => sum + Number(delivery.price_ngn || 0), 0);
      return {
        title: "Today at a glance",
        href: roleHome.rider,
        items: [
          { label: "Deliveries", value: String((deliveries || []).length), helper: "Today" },
          { label: "Earnings", value: formatNaira(earnings), helper: "Completed jobs" },
          { label: "Rating", value: rider?.rating ? rider.rating.toFixed(1) : "-", helper: "Current score" }
        ]
      };
    }

    const client = role === "admin" ? createAdminClient() || supabase : supabase;
    const query = role === "admin" ? client.from("deliveries").select("status, price_ngn").gte("created_at", startOfToday) : client.from("deliveries").select("status, price_ngn").eq("customer_id", userId).gte("created_at", startOfToday);
    const [{ data: deliveries }, { data: wallet }] = await Promise.all([
      query,
      role === "admin" ? Promise.resolve({ data: null }) : client.from("wallets").select("balance_ngn").eq("user_id", userId).eq("wallet_type", "customer").maybeSingle<{ balance_ngn?: number | null }>()
    ]);
    const completed = (deliveries || []).filter((delivery) => delivery.status === "delivered");
    const value = (deliveries || []).reduce((sum, delivery) => sum + Number(delivery.price_ngn || 0), 0);
    const labels = role === "business" ? { count: "Dispatches", value: "Spend", helper: "Today" } : role === "admin" ? { count: "Deliveries", value: "Value", helper: "Today" } : { count: "Deliveries", value: "Wallet", helper: "Available" };

    return {
      title: "Today at a glance",
      href: roleHome[role],
      items: [
        { label: labels.count, value: String((deliveries || []).length), helper: labels.helper },
        { label: labels.value, value: role === "customer" ? formatNaira(Number(wallet?.balance_ngn || 0)) : formatNaira(value), helper: role === "customer" ? "Available" : labels.helper },
        { label: "Completed", value: String(completed.length), helper: "Delivered" }
      ]
    };
  } catch {
    return {
      title: "Today at a glance",
      href: roleHome[role],
      items: [
        { label: role === "business" ? "Dispatches" : "Deliveries", value: "0", helper: "Today" },
        { label: role === "rider" ? "Earnings" : "Wallet", value: formatNaira(0), helper: "Available" },
        { label: role === "rider" ? "Rating" : "Completed", value: "-", helper: "No data yet" }
      ]
    };
  }
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Math.round(value || 0));
}
