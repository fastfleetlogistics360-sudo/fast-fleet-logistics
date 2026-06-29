import { DEFAULT_FARE_CONFIG, normalizeFareConfig, type FareConfig } from "@/lib/fare";
import { createAdminClient } from "@/lib/supabase/admin";

export const siteControlsSettingsKey = "admin_site_controls";

export async function loadFareConfig(): Promise<FareConfig> {
  const supabase = createAdminClient();
  if (!supabase) return DEFAULT_FARE_CONFIG;

  const { data } = await supabase.from("platform_settings").select("value").eq("key", siteControlsSettingsKey).maybeSingle();
  const value = (data?.value || {}) as { fare_config?: unknown };
  return normalizeFareConfig(value.fare_config);
}
