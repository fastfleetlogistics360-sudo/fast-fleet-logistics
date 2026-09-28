import type { SupabaseClient } from "@supabase/supabase-js";

export type MarketplaceOperatorMembership = {
  id: string;
  marketplace_vendor_id: string | null;
  role: "operator" | "manager";
  all_vendors: boolean;
};

/** Server-side-only authorization primitive for the future operations API. */
export async function hasActiveMarketplaceOperatorScope(
  db: SupabaseClient,
  userId: string,
  marketplaceVendorId: string
) {
  const { data, error } = await db
    .from("marketplace_operator_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .is("revoked_at", null)
    .or(`all_vendors.eq.true,marketplace_vendor_id.eq.${marketplaceVendorId}`)
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

/** Returns only live memberships; callers still enforce managed-vendor mode. */
export async function activeMarketplaceOperatorMemberships(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("marketplace_operator_memberships")
    .select("id, marketplace_vendor_id, role, all_vendors")
    .eq("user_id", userId)
    .eq("active", true)
    .is("revoked_at", null);
  if (error) throw error;
  return (data || []) as MarketplaceOperatorMembership[];
}

export async function hasActiveMarketplaceOperatorMembership(db: SupabaseClient, userId: string) {
  return (await activeMarketplaceOperatorMemberships(db, userId)).length > 0;
}
