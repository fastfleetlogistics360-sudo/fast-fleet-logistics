import type { SupabaseClient } from "@supabase/supabase-js";
import { isPendingSquadStatus, isSuccessfulSquadStatus, verifySquadTransaction } from "@/lib/payments/squad";
import { loadPaymentIntent, type PaymentIntent, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { redeemLaunchDeliveryPromo } from "@/lib/promos/launch-first-150";
import { accountMessengerHref } from "@/lib/tracking-links";

export type PaymentSettlementActor =
  | { type: "customer"; userId: string }
  | { type: "admin"; userId: string }
  | { type: "webhook" }
  | { type: "reconciliation" };

export type PaymentSettlementResult = {
  status: "settled" | "already_settled" | "pending" | "failed" | "requires_review" | "not_found" | "forbidden" | "retryable";
  code: string;
  intentId?: string;
  purpose?: PaymentIntentPurpose;
  deliveryId?: string | null;
  orderId?: string | null;
  walletId?: string | null;
  amountNgn?: number;
  settledNow?: boolean;
};

export class PaymentSettlementError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * The sole financial finalisation path for Squad payments. It verifies with
 * Squad first, then asks the database RPC to settle under row locks.
 */
export async function settleSquadPayment(
  db: SupabaseClient,
  input: { reference: string; actor: PaymentSettlementActor }
): Promise<PaymentSettlementResult> {
  const intent = await loadPaymentIntent(db, input.reference);
  if (!intent) return { status: "not_found", code: "PAYMENT_INTENT_NOT_FOUND" };
  if (!actorCanAccessIntent(input.actor, intent)) return { status: "forbidden", code: "PAYMENT_OWNER_MISMATCH" };
  if (intent.status === "settled") return settledResult(intent, false);

  let transaction;
  try {
    transaction = await verifySquadTransaction(intent.provider_transaction_reference);
  } catch {
    await observePaymentIntent(db, intent.id, "pending", "PAYMENT_SETTLEMENT_RETRYABLE", null);
    return intentResult(intent, "retryable", "PAYMENT_SETTLEMENT_RETRYABLE");
  }

  const referenceMatches = transaction.reference === intent.provider_transaction_reference;
  const amountMatches = transaction.amountMinor === Number(intent.expected_amount_minor);
  const currencyMatches = transaction.currency.trim().toUpperCase() === intent.currency;
  const providerStatus = String(transaction.status || "unknown");

  if (!referenceMatches) {
    await observePaymentIntent(db, intent.id, "requires_review", "PAYMENT_REFERENCE_MISMATCH", providerStatus);
    return intentResult(intent, "requires_review", "PAYMENT_REFERENCE_MISMATCH");
  }
  if (!amountMatches) {
    await observePaymentIntent(db, intent.id, "requires_review", "PAYMENT_AMOUNT_MISMATCH", providerStatus);
    return intentResult(intent, "requires_review", "PAYMENT_AMOUNT_MISMATCH");
  }
  if (!currencyMatches) {
    await observePaymentIntent(db, intent.id, "requires_review", "PAYMENT_CURRENCY_MISMATCH", providerStatus);
    return intentResult(intent, "requires_review", "PAYMENT_CURRENCY_MISMATCH");
  }
  if (isPendingSquadStatus(providerStatus)) {
    await observePaymentIntent(db, intent.id, "pending", "PAYMENT_NOT_SUCCESSFUL", providerStatus);
    return intentResult(intent, "pending", "PAYMENT_NOT_SUCCESSFUL");
  }
  if (!isSuccessfulSquadStatus(providerStatus)) {
    await observePaymentIntent(db, intent.id, "failed", "PAYMENT_NOT_SUCCESSFUL", providerStatus);
    return intentResult(intent, "failed", "PAYMENT_NOT_SUCCESSFUL");
  }

  const { data, error } = await db.rpc("settle_squad_payment_intent", {
    target_payment_intent_id: intent.id,
    next_provider_reference: transaction.reference,
    next_amount_minor: transaction.amountMinor,
    next_currency: transaction.currency.trim().toUpperCase(),
    next_provider_status: providerStatus,
    next_gateway_reference: transaction.gatewayReference,
    next_paid_at: transaction.paidAt
  });
  if (error) {
    throw new PaymentSettlementError("PAYMENT_SETTLEMENT_RETRYABLE");
  }

  const result = rpcObject(data);
  const settled = result.status === "settled";
  const alreadySettled = result.status === "already_settled";
  if (!settled && !alreadySettled) {
    return intentResult(intent, "requires_review", "PAYMENT_REQUIRES_REVIEW");
  }

  const settlementResult: PaymentSettlementResult = {
    status: alreadySettled ? "already_settled" : "settled",
    code: alreadySettled ? "PAYMENT_ALREADY_SETTLED" : "PAYMENT_SETTLED",
    intentId: intent.id,
    purpose: intent.purpose,
    deliveryId: intent.delivery_id,
    orderId: intent.order_id,
    walletId: intent.wallet_id,
    amountNgn: intent.expected_amount_minor / 100,
    settledNow: settled
  };
  await runPostSettlementEffects(db, intent, settlementResult).catch(() => undefined);
  return settlementResult;
}

export async function observePaymentIntent(
  db: SupabaseClient,
  intentId: string,
  status: "pending" | "failed" | "requires_review",
  failureCode: string,
  providerStatus: string | null
) {
  const { error } = await db.rpc("record_squad_payment_observation", {
    target_payment_intent_id: intentId,
    next_status: status,
    next_failure_code: failureCode,
    next_provider_status: providerStatus
  });
  if (error) throw new PaymentSettlementError("PAYMENT_SETTLEMENT_RETRYABLE");
}

function actorCanAccessIntent(actor: PaymentSettlementActor, intent: PaymentIntent) {
  if (actor.type === "webhook" || actor.type === "reconciliation" || actor.type === "admin") return true;
  return actor.userId === intent.owner_user_id;
}

function settledResult(intent: PaymentIntent, settledNow: boolean): PaymentSettlementResult {
  return {
    status: settledNow ? "settled" : "already_settled",
    code: settledNow ? "PAYMENT_SETTLED" : "PAYMENT_ALREADY_SETTLED",
    intentId: intent.id,
    purpose: intent.purpose,
    deliveryId: intent.delivery_id,
    orderId: intent.order_id,
    walletId: intent.wallet_id,
    amountNgn: intent.expected_amount_minor / 100,
    settledNow
  };
}

function intentResult(intent: PaymentIntent, status: PaymentSettlementResult["status"], code: string): PaymentSettlementResult {
  return {
    status,
    code,
    intentId: intent.id,
    purpose: intent.purpose,
    deliveryId: intent.delivery_id,
    orderId: intent.order_id,
    walletId: intent.wallet_id,
    amountNgn: intent.expected_amount_minor / 100,
    settledNow: false
  };
}

function rpcObject(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return (value[0] || {}) as Record<string, unknown>;
  return (value || {}) as Record<string, unknown>;
}

async function runPostSettlementEffects(db: SupabaseClient, intent: PaymentIntent, result: PaymentSettlementResult) {
  if ((intent.purpose === "delivery_payment" || intent.purpose === "marketplace_delivery_payment") && intent.delivery_id) {
    // This function is idempotent; retry it after an already-settled callback
    // so a brief notification/promo outage never changes financial settlement.
    await redeemLaunchDeliveryPromo(db, intent.delivery_id);
  }
  if (intent.purpose !== "marketplace_business_order" || !intent.order_id || !result.settledNow) return;

  const { data: order } = await db
    .from("orders")
    .select("id, order_code, customer_id, business_id, business_profile_id")
    .eq("id", intent.order_id)
    .maybeSingle<{
      id: string;
      order_code: string | null;
      customer_id: string | null;
      business_id: string | null;
      business_profile_id: string | null;
    }>();
  if (!order?.business_id || !order.customer_id) return;
  const code = order.order_code || intent.provider_transaction_reference;
  await Promise.allSettled([
    insertNotificationWithPush(db, {
      user_id: order.business_id,
      title: "New paid marketplace order",
      body: `${code} is paid and waiting for your team to prepare.`,
      type: "business_order_received",
      metadata: { order_id: order.id, order_code: code, business_profile_id: order.business_profile_id, url: "/business/dashboard#marketplace-orders", tag: `ff-business-${code}` }
    }),
    insertNotificationWithPush(db, {
      user_id: order.customer_id,
      title: "Marketplace payment confirmed",
      body: `${code} has been sent to the business.`,
      type: "order_update",
      metadata: { order_id: order.id, order_code: code, status: "received", url: accountMessengerHref(code), tag: `ff-${code}` }
    })
  ]);
}
