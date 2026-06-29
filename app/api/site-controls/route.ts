import { NextResponse } from "next/server";
import { defaultBrandPartners, normalizeBrandPartners } from "@/lib/brand-partners";
import { DEFAULT_FARE_CONFIG, normalizeFareConfig } from "@/lib/fare";
import { siteControlsSettingsKey } from "@/lib/fare-settings";
import { createAdminClient } from "@/lib/supabase/admin";

const publicDefaults = {
  brand_partners: defaultBrandPartners,
  fare_config: DEFAULT_FARE_CONFIG
};

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(publicDefaults);
  }

  const { data } = await supabase.from("platform_settings").select("value").eq("key", siteControlsSettingsKey).maybeSingle();
  const value = (data?.value || {}) as Record<string, unknown>;

  return NextResponse.json({
    brand_partners: normalizeBrandPartners(value.brand_partners),
    fare_config: normalizeFareConfig(value.fare_config)
  });
}
