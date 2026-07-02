import { defaultBrandPartners, normalizeBrandPartners } from "@/lib/brand-partners";
import { siteControlsSettingsKey } from "@/lib/fare-settings";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls } from "@/lib/mall-menu";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey } from "@/lib/restaurant-menu";
import { createAdminClient } from "@/lib/supabase/admin";

export async function loadPublicBrandPartners() {
  try {
    const supabase = createAdminClient();
    if (!supabase) return defaultBrandPartners;

    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", siteControlsSettingsKey).maybeSingle();
    if (error) return defaultBrandPartners;
    const value = (data?.value || {}) as Record<string, unknown>;
    return normalizeBrandPartners(value.brand_partners);
  } catch {
    return defaultBrandPartners;
  }
}

export async function loadPublicShoppingMalls() {
  try {
    const supabase = createAdminClient();
    if (!supabase) return defaultShoppingMalls;

    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", mallMenuSettingsKey).maybeSingle();
    if (error) return defaultShoppingMalls;
    return normalizeShoppingMalls(data?.value || defaultShoppingMalls);
  } catch {
    return defaultShoppingMalls;
  }
}

export async function loadPublicRestaurantKitchens() {
  try {
    const supabase = createAdminClient();
    if (!supabase) return defaultRestaurantKitchens;

    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle();
    if (error) return defaultRestaurantKitchens;
    return normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens);
  } catch {
    return defaultRestaurantKitchens;
  }
}
