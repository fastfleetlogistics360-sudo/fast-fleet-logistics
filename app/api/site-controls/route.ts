import { NextResponse } from "next/server";
import { defaultBrandPartners, normalizeBrandPartners } from "@/lib/brand-partners";
import { createAdminClient } from "@/lib/supabase/admin";

const settingsKey = "admin_site_controls";

const publicDefaults = {
  brand_partners: defaultBrandPartners
};

export async function GET() {
  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(publicDefaults);
  }

  const { data } = await supabase.from("platform_settings").select("value").eq("key", settingsKey).maybeSingle();
  const value = (data?.value || {}) as Record<string, unknown>;

  return NextResponse.json({
    brand_partners: normalizeBrandPartners(value.brand_partners)
  });
}
