import type { SupabaseClient } from "@supabase/supabase-js";

export type FastErrandPayoutSettlement = {
  applicable: boolean;
  payout_model?: "company_bicycle" | "investor_bicycle" | "independent_rider";
  rider_payout_ngn?: number | string | null;
  investor_payout_ngn?: number | string | null;
  company_share_ngn?: number | string | null;
};

/** Freeze at rider acceptance, after the delivery RPC has atomically assigned its asset. */
export async function freezeFastErrandDeliveryPayout(db: SupabaseClient, deliveryId: string) {
  const { data, error } = await db.rpc("freeze_fast_errand_delivery_payout", { target_delivery_id: deliveryId });
  if (error) throw error;
  return (data || { applicable: false }) as FastErrandPayoutSettlement;
}

/** Credits the investor side only; the existing wallet ledger credits the rider side. */
export async function settleFastErrandInvestorPayout(db: SupabaseClient, deliveryId: string) {
  const { data, error } = await db.rpc("settle_fast_errand_investor_payout", { target_delivery_id: deliveryId });
  if (error) throw error;
  return (data || { applicable: false }) as FastErrandPayoutSettlement;
}
