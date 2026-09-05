import type { SupabaseClient } from "@supabase/supabase-js";

export type InvestorDeliverySettlement = {
  investor_owned: boolean;
  rider_share_ngn?: number | string | null;
  owner_share_ngn?: number | string | null;
  maintenance_reserve_ngn?: number | string | null;
};

/** Settles only investor-owned bicycle deliveries. It is database-idempotent. */
export async function settleInvestorDelivery(db: SupabaseClient, deliveryId: string): Promise<InvestorDeliverySettlement> {
  const { data, error } = await db.rpc("settle_investor_delivery", { target_delivery_id: deliveryId });
  if (error) throw error;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { investor_owned: false };
  return data as InvestorDeliverySettlement;
}
