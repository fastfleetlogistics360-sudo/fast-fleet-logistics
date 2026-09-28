import type { SupabaseClient } from "@supabase/supabase-js";

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
