import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderMarketplace } from "@/components/marketplace/order-marketplace";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey } from "@/lib/restaurant-menu";

type KitchenPageProps = {
  params: Promise<{ kitchenId: string }>;
};

export const metadata: Metadata = {
  title: "Restaurant Kitchen"
};

export default async function RestaurantKitchenPage({ params }: KitchenPageProps) {
  const { kitchenId } = await params;
  const kitchens = await loadRestaurantKitchens();
  const kitchen = kitchens.find((item) => item.id === kitchenId);
  if (!kitchen) notFound();

  return (
    <OrderMarketplace
      title={`${kitchen.name} kitchen`}
      eyebrow="Restaurant kitchen"
      stores={[kitchen]}
      kind="restaurant"
    />
  );
}

async function loadRestaurantKitchens() {
  const supabase = createAdminClient();
  if (!supabase) return defaultRestaurantKitchens;
  const { data } = await supabase.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle();
  return normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens);
}
