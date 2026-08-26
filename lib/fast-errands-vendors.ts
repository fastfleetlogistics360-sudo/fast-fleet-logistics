import { createAdminClient } from "@/lib/supabase/admin";

export const fastErrandsVendorSettingsKey = "fast_errands_vendor_business_ids";

export function normalizeFastErrandsVendorIds(value: unknown) {
  const raw = Array.isArray(value) ? value : value && typeof value === "object" ? (value as { businessIds?: unknown }).businessIds : [];
  return Array.from(new Set((Array.isArray(raw) ? raw : []).map((id) => String(id || "").trim()).filter(Boolean)));
}

export async function loadFastErrandsVendorIds() {
  try {
    const db = createAdminClient();
    if (!db) return [];
    const { data } = await db.from("platform_settings").select("value").eq("key", fastErrandsVendorSettingsKey).maybeSingle();
    return normalizeFastErrandsVendorIds(data?.value);
  } catch {
    return [];
  }
}

export type FastErrandsVendor = {
  id: string;
  business_name: string;
  pickup_address?: string | null;
  operating_state?: string | null;
};

export async function loadFastErrandsVendors(): Promise<FastErrandsVendor[]> {
  try {
    const ids = await loadFastErrandsVendorIds();
    if (!ids.length) return [];
    const db = createAdminClient();
    if (!db) return [];
    const { data } = await db
      .from("business_profiles")
      .select("id, business_name, pickup_address, operating_state")
      .eq("registration_status", "active")
      .in("id", ids)
      .order("business_name");
    return (data || []) as FastErrandsVendor[];
  } catch {
    return [];
  }
}
