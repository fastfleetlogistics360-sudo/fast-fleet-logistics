import { NextResponse } from "next/server";
import { defaultBrandPartners, normalizeBrandPartners } from "@/lib/brand-partners";
import { DEFAULT_FARE_CONFIG, normalizeFareConfig } from "@/lib/fare";
import { siteControlsSettingsKey } from "@/lib/fare-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_WALLET_TOP_UP_POLICY, normalizeWalletTopUpPolicy } from "@/lib/wallet-topup-policy";

const publicDefaults = {
  brand_partners: defaultBrandPartners,
  fare_config: DEFAULT_FARE_CONFIG,
  wallet_policy: { min_topup_ngn: DEFAULT_WALLET_TOP_UP_POLICY.minTopUpNgn, max_topup_ngn: DEFAULT_WALLET_TOP_UP_POLICY.maxTopUpNgn }
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
    fare_config: normalizeFareConfig(value.fare_config),
    wallet_policy: toPublicWalletPolicy(value.wallet_policy)
  });
}

function toPublicWalletPolicy(value: unknown) {
  const policy = normalizeWalletTopUpPolicy(value);
  return { min_topup_ngn: policy.minTopUpNgn, max_topup_ngn: policy.maxTopUpNgn };
}
