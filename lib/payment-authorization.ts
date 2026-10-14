import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Contact details and rider workflow controls must use a settled payment
 * record, never a client-provided payment status or a delivery status.
 */
export async function verifiedDeliveryPaymentIds(db: SupabaseClient, deliveryIds: string[]) {
  const ids = [...new Set(deliveryIds.filter(Boolean))];
  if (!ids.length) return new Set<string>();

  const [intents, transactions] = await Promise.all([
    db.from("payment_intents").select("delivery_id").in("delivery_id", ids).eq("status", "settled"),
    db.from("transactions").select("delivery_id").in("delivery_id", ids).eq("transaction_type", "delivery_payment").eq("status", "successful")
  ]);

  // The database RLS function added with this feature applies the same rule.
  // Treat a lookup failure as not authorized: a temporary read problem must
  // never disclose contact information or release a rider action.
  if (intents.error || transactions.error) return new Set<string>();
  return new Set([
    ...(intents.data || []).map((row) => row.delivery_id),
    ...(transactions.data || []).map((row) => row.delivery_id)
  ].filter((id): id is string => typeof id === "string"));
}

export function isNoChargeDelivery(delivery: { price_ngn?: number | string | null }) {
  return Number(delivery.price_ngn || 0) === 0;
}

export async function deliveryPaymentIsVerified(db: SupabaseClient, delivery: { id: string; price_ngn?: number | string | null }) {
  if (isNoChargeDelivery(delivery)) return true;
  return (await verifiedDeliveryPaymentIds(db, [delivery.id])).has(delivery.id);
}
