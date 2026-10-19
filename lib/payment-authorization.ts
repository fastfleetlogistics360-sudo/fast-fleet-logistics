import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Contact details and rider workflow controls must use a settled payment
 * record, never a client-provided payment status or a delivery status.
 */
export async function verifiedDeliveryPaymentIds(db: SupabaseClient, deliveryIds: string[]) {
  const ids = [...new Set(deliveryIds.filter(Boolean))];
  if (!ids.length) return new Set<string>();

  // Marketplace business orders are paid as orders, then create their rider
  // delivery only after the vendor marks the order ready.  Their settled
  // payment intent is therefore linked to `orders.id`, not necessarily to
  // `deliveries.id`.  Resolve that trusted relationship server-side so a
  // paid Marketplace delivery can never be mistaken for a rider-first job.
  const [intents, transactions, marketplaceDeliveries] = await Promise.all([
    db.from("payment_intents").select("delivery_id").in("delivery_id", ids).eq("status", "settled"),
    db.from("transactions").select("delivery_id").in("delivery_id", ids).eq("transaction_type", "delivery_payment").eq("status", "successful"),
    db.from("deliveries").select("id, marketplace_order_id").in("id", ids)
  ]);

  // The database RLS function added with this feature applies the same rule.
  // Treat a lookup failure as not authorized: a temporary read problem must
  // never disclose contact information or release a rider action.
  if (intents.error || transactions.error || marketplaceDeliveries.error) return new Set<string>();

  const deliveryToOrder = new Map(
    (marketplaceDeliveries.data || [])
      .filter((delivery) => Boolean(delivery.marketplace_order_id))
      .map((delivery) => [delivery.id, String(delivery.marketplace_order_id)])
  );
  const marketplaceOrderIds = [...new Set(deliveryToOrder.values())];
  const marketplaceOrders = marketplaceOrderIds.length
    ? await db
        .from("orders")
        .select("id, order_code, payment_method, payment_status")
        .in("id", marketplaceOrderIds)
    : { data: [], error: null };
  if (marketplaceOrders.error) return new Set<string>();
  const marketplaceIntents = marketplaceOrderIds.length
    ? await db
        .from("payment_intents")
        .select("order_id")
        .in("order_id", marketplaceOrderIds)
        .eq("purpose", "marketplace_business_order")
        .eq("status", "settled")
    : { data: [], error: null };
  if (marketplaceIntents.error) return new Set<string>();

  const settledMarketplaceOrderIds = new Set((marketplaceIntents.data || [])
    .map((intent) => intent.order_id)
    .filter((orderId): orderId is string => typeof orderId === "string"));
  const walletReferences = (marketplaceOrders.data || [])
    .filter((order) => order.payment_method === "wallet" && order.payment_status === "paid" && typeof order.order_code === "string")
    .map((order) => `${order.order_code}-wallet-checkout`);
  const walletPayments = walletReferences.length
    ? await db.from("transactions").select("provider_reference").in("provider_reference", walletReferences).eq("transaction_type", "delivery_payment").eq("status", "successful").eq("provider", "fastfleet_wallet")
    : { data: [], error: null };
  if (walletPayments.error) return new Set<string>();
  const settledWalletReferences = new Set((walletPayments.data || []).map((payment) => payment.provider_reference));
  for (const order of marketplaceOrders.data || []) {
    if (order.payment_method === "wallet" && order.payment_status === "paid" && typeof order.order_code === "string" && settledWalletReferences.has(`${order.order_code}-wallet-checkout`)) {
      settledMarketplaceOrderIds.add(order.id);
    }
  }

  return new Set([
    ...(intents.data || []).map((row) => row.delivery_id),
    ...(transactions.data || []).map((row) => row.delivery_id),
    ...[...deliveryToOrder.entries()]
      .filter(([, orderId]) => settledMarketplaceOrderIds.has(orderId))
      .map(([deliveryId]) => deliveryId)
  ].filter((id): id is string => typeof id === "string"));
}

export function isNoChargeDelivery(delivery: { price_ngn?: number | string | null }) {
  return Number(delivery.price_ngn || 0) === 0;
}

export async function deliveryPaymentIsVerified(db: SupabaseClient, delivery: { id: string; price_ngn?: number | string | null }) {
  if (isNoChargeDelivery(delivery)) return true;
  return (await verifiedDeliveryPaymentIds(db, [delivery.id])).has(delivery.id);
}
