import type { SupabaseClient } from "@supabase/supabase-js";
import { createPaymentIntent, loadPaymentIntent, paymentIntentReferenceIsSafe, type PaymentIntent } from "@/lib/payments/payment-intents";

type LegacyIntentResult = PaymentIntent | null;

/**
 * Legacy rows are mapped only when their owner, provider reference, amount,
 * currency and concrete target can be read from server-owned records.
 */
export async function ensureLegacyDeliveryPaymentIntent(
  db: SupabaseClient,
  input: { reference: string; ownerUserId: string; deliveryId?: string; deliveryCode?: string }
): Promise<LegacyIntentResult> {
  const existing = await loadPaymentIntent(db, input.reference);
  if (existing) return existing;
  if (!paymentIntentReferenceIsSafe(input.reference)) return null;

  let query = db
    .from("deliveries")
    .select("id, delivery_code, customer_id, price_ngn, metadata, status")
    .eq("customer_id", input.ownerUserId);
  query = input.deliveryId ? query.eq("id", input.deliveryId) : query.eq("delivery_code", input.deliveryCode || "");
  const { data: delivery, error } = await query.maybeSingle<{
    id: string;
    delivery_code: string;
    customer_id: string;
    price_ngn: number | string;
    metadata: Record<string, unknown> | null;
    status: string;
  }>();
  if (error) throw error;
  const metadata = record(delivery?.metadata);
  if (
    !delivery ||
    delivery.status !== "pending_payment" ||
    String(metadata.provider_reference || "") !== input.reference ||
    Number(delivery.price_ngn || 0) <= 0
  ) {
    return null;
  }

  return createLegacyIntent(db, {
    reference: input.reference,
    internalReference: `delivery:${delivery.id}`,
    purpose: metadata.source === "fastfleet_marketplace" ? "marketplace_delivery_payment" : "delivery_payment",
    ownerUserId: delivery.customer_id,
    amountNgn: Number(delivery.price_ngn),
    deliveryId: delivery.id
  });
}

export async function ensureLegacyMarketplacePaymentIntent(db: SupabaseClient, input: { reference: string; ownerUserId: string }): Promise<LegacyIntentResult> {
  const existing = await loadPaymentIntent(db, input.reference);
  if (existing) return existing;
  if (!paymentIntentReferenceIsSafe(input.reference)) return null;

  const { data: order, error } = await db
    .from("orders")
    .select("id, order_code, customer_id, amount, payment_status")
    .eq("order_code", input.reference)
    .eq("customer_id", input.ownerUserId)
    .maybeSingle<{ id: string; order_code: string; customer_id: string; amount: number | string; payment_status: string }>();
  if (error) throw error;
  if (order && order.payment_status === "pending" && Number(order.amount || 0) > 0) {
    return createLegacyIntent(db, {
      reference: input.reference,
      internalReference: `order:${order.id}`,
      purpose: "marketplace_business_order",
      ownerUserId: order.customer_id,
      amountNgn: Number(order.amount),
      orderId: order.id
    });
  }

  return ensureLegacyDeliveryPaymentIntent(db, { reference: input.reference, ownerUserId: input.ownerUserId, deliveryCode: input.reference });
}

export async function ensureLegacyWalletFundingIntent(db: SupabaseClient, input: { reference: string; ownerUserId: string }): Promise<LegacyIntentResult> {
  const existing = await loadPaymentIntent(db, input.reference);
  if (existing) return existing;
  if (!paymentIntentReferenceIsSafe(input.reference)) return null;

  const { data: transaction, error } = await db
    .from("transactions")
    .select("id, wallet_id, amount_ngn, status, provider, provider_reference")
    .eq("provider_reference", input.reference)
    .eq("transaction_type", "wallet_funding")
    .maybeSingle<{ id: string; wallet_id: string; amount_ngn: number | string; status: string; provider: string | null; provider_reference: string }>();
  if (error) throw error;
  if (!transaction || transaction.status !== "pending" || transaction.provider !== "squad" || Number(transaction.amount_ngn || 0) <= 0) return null;

  const { data: wallet, error: walletError } = await db
    .from("wallets")
    .select("id, user_id")
    .eq("id", transaction.wallet_id)
    .eq("user_id", input.ownerUserId)
    .maybeSingle<{ id: string; user_id: string }>();
  if (walletError) throw walletError;
  if (!wallet) return null;

  return createLegacyIntent(db, {
    reference: input.reference,
    internalReference: `wallet-funding:${input.reference}`,
    purpose: "wallet_funding",
    ownerUserId: wallet.user_id,
    amountNgn: Number(transaction.amount_ngn),
    walletId: wallet.id
  });
}

export async function mapSafeLegacyPaymentIntents(db: SupabaseClient, limit = 20) {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  let mapped = 0;

  const { data: deliveries } = await db
    .from("deliveries")
    .select("id, delivery_code, customer_id, price_ngn, metadata, status")
    .eq("status", "pending_payment")
    .limit(boundedLimit);
  for (const delivery of deliveries || []) {
    const metadata = record(delivery.metadata);
    const reference = String(metadata.provider_reference || "");
    if (!reference || !paymentIntentReferenceIsSafe(reference)) continue;
    const intent = await ensureLegacyDeliveryPaymentIntent(db, {
      reference,
      ownerUserId: String(delivery.customer_id || ""),
      deliveryId: String(delivery.id || "")
    });
    if (intent?.source === "legacy") mapped += 1;
  }

  const { data: orders } = await db
    .from("orders")
    .select("id, order_code, customer_id, amount, payment_status")
    .eq("payment_status", "pending")
    .not("order_code", "is", null)
    .limit(boundedLimit);
  for (const order of orders || []) {
    const reference = String(order.order_code || "");
    if (!reference || !paymentIntentReferenceIsSafe(reference)) continue;
    const intent = await ensureLegacyMarketplacePaymentIntent(db, { reference, ownerUserId: String(order.customer_id || "") });
    if (intent?.source === "legacy") mapped += 1;
  }

  return mapped;
}

async function createLegacyIntent(
  db: SupabaseClient,
  input: Parameters<typeof createPaymentIntent>[1]
): Promise<LegacyIntentResult> {
  try {
    return await createPaymentIntent(db, { ...input, source: "legacy" });
  } catch {
    return loadPaymentIntent(db, input.reference);
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
