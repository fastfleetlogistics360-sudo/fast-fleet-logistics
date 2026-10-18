import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The subsidy is deliberately scoped to food only. Fees are added afterwards
 * so a ₦3,000 meal is still a paid checkout (at minimum the platform fee).
 */
export function mondayBreakfastPayable(input: {
  foodSubtotalNgn: number;
  subsidyNgn: number;
  platformFeeNgn: number;
  deliveryFeeNgn: number;
}) {
  const foodSubtotalNgn = nonNegativeNaira(input.foodSubtotalNgn);
  const subsidyNgn = Math.min(foodSubtotalNgn, nonNegativeNaira(input.subsidyNgn));
  const platformFeeNgn = nonNegativeNaira(input.platformFeeNgn);
  const deliveryFeeNgn = nonNegativeNaira(input.deliveryFeeNgn);
  const customerFoodAmountNgn = foodSubtotalNgn - subsidyNgn;
  return {
    foodSubtotalNgn,
    subsidyNgn,
    customerFoodAmountNgn,
    platformFeeNgn,
    deliveryFeeNgn,
    totalNgn: customerFoodAmountNgn + platformFeeNgn + deliveryFeeNgn
  };
}

/** Server-only wrapper. Its RPC verifies vendor.source_kind in the database. */
export async function reserveMondayFreeBreakfast(input: {
  db: SupabaseClient; vendorId: string; customerId: string; orderId: string; foodSubtotalNgn: number; idempotencyKey: string;
}) {
  const { data, error } = await input.db.rpc("reserve_monday_free_breakfast", {
    target_vendor_id: input.vendorId,
    target_customer_id: input.customerId,
    target_order_id: input.orderId,
    food_subtotal_kobo: Math.max(0, Math.round(input.foodSubtotalNgn * 100)),
    request_key: input.idempotencyKey
  });
  if (error) throw error;
  const result = (data || {}) as { eligible?: boolean; subsidy_kobo?: number };
  return { eligible: result.eligible === true, subsidyNgn: Math.max(0, Number(result.subsidy_kobo || 0)) / 100 };
}

function nonNegativeNaira(value: number) {
  return Math.max(0, Math.round(Number(value) || 0));
}
