import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuickActionHub } from "@/components/hub/quick-action-hub";
import { enabledHubPromotionSlides, hubPromotionSlidesSettingsKey, type HubPromotionSlide } from "@/lib/hub-promotion-slides";
import { parseUserRole, roleHome } from "@/lib/auth/roles";
import { getLaunchPromoAnnouncement } from "@/lib/promos/launch-first-150";
import type { UserRole } from "@/types/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "App Hub"
};

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth?returnTo=/hub");

  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("account_type, avatar_url").eq("user_id", user.id).maybeSingle<{ account_type?: string | null; avatar_url?: string | null }>(),
    supabase.from("users").select("full_name, email, avatar_url").eq("id", user.id).maybeSingle<{ full_name?: string | null; email?: string | null; avatar_url?: string | null }>()
  ]);

  const role = parseUserRole(profile?.account_type || user.user_metadata?.account_type || user.user_metadata?.role);
  if (!role) redirect("/choose-account-type?returnTo=/hub");
  const admin = createAdminClient();
  const [promotionSlides, glance, launchPromo] = await Promise.all([
    loadHubPromotionSlides(),
    loadHubGlance(user.id, role),
    getLaunchPromoAnnouncement(admin || supabase, user.id)
  ]);

  return (
    <QuickActionHub
      role={role}
      fullName={account?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null}
      email={account?.email || user.email || null}
      avatarUrl={account?.avatar_url || profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null}
      promotionSlides={promotionSlides}
      glance={glance}
      launchPromo={launchPromo}
    />
  );
}

type HubGlance = {
  title: string;
  href: string;
  items: Array<{ label: string; value: string; helper: string }>;
};

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

async function loadHubGlance(userId: string, role: UserRole): Promise<HubGlance> {
  const supabase = await createClient();
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
        { label: role === "rider" ? "Earnings" : "Wallet", value: role === "rider" ? formatNaira(0) : formatNaira(0), helper: "Available" },
        { label: role === "rider" ? "Rating" : "Completed", value: "-", helper: "No data yet" }
      ]
    };
  }
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(Math.round(value || 0));
}
