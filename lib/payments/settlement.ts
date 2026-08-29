import type { SupabaseClient } from "@supabase/supabase-js";
import { isPendingSquadStatus, isSuccessfulSquadStatus, verifySquadTransaction } from "@/lib/payments/squad";
import { loadPaymentIntent, type PaymentIntent, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { redeemLaunchDeliveryPromo } from "@/lib/promos/launch-first-150";
import { accountMessengerHref } from "@/lib/tracking-links";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";

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
  if (!result.settledNow) return;
  if (intent.purpose === "delivery_payment" && intent.delivery_id) {
    await markFastErrandCustomerFundsConfirmed(db, intent.delivery_id);
  }
  if (intent.purpose === "wallet_funding" && intent.wallet_id) {
    await applyFastErrandTopUp(db, intent);
  }
  if (intent.purpose === "marketplace_business_order" && intent.order_id) {
    const { data: order } = await db
      .from("orders")
      .select("id, order_code, customer_id, business_id, business_profile_id, marketplace_kind")
      .eq("id", intent.order_id)
      .maybeSingle<{
        id: string;
        order_code: string | null;
        customer_id: string | null;
        business_id: string | null;
        business_profile_id: string | null;
        marketplace_kind: string | null;
      }>();
    if (order?.business_id && order.customer_id) {
      const code = order.order_code || intent.provider_transaction_reference;
      const isFastErrand = order.marketplace_kind === "fast_errands";
      await Promise.allSettled([
        insertNotificationWithPush(db, {
          user_id: order.business_id,
          title: isFastErrand ? "New paid FastErrand" : "New paid marketplace order",
          body: `${code} is paid and waiting for your team to prepare.`,
          type: "business_order_received",
          metadata: { order_id: order.id, order_code: code, business_profile_id: order.business_profile_id, url: "/business/dashboard#marketplace-orders", tag: `ff-business-${code}` }
        }),
        insertNotificationWithPush(db, {
          user_id: order.customer_id,
          title: isFastErrand ? "FastErrand payment confirmed" : "Marketplace payment confirmed",
          body: `${code} has been sent to the business.`,
          type: "order_update",
          metadata: { order_id: order.id, order_code: code, status: "received", url: accountMessengerHref(code), tag: `ff-${code}` }
        })
      ]);
    }
  }
  await announceWhatsAppPayment(db, intent, intent.provider_transaction_reference);
}

async function markFastErrandCustomerFundsConfirmed(db: SupabaseClient, deliveryId: string) {
  const { data } = await db
    .from("fast_errand_orders")
    .update({ status: "funded_waiting_admin", funded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("delivery_id", deliveryId)
    .eq("status", "awaiting_customer_payment")
    .select("id, errand_code")
    .maybeSingle<{ id: string; errand_code: string }>();
  if (data?.id) {
    await db.from("fast_errand_events").insert({ errand_id: data.id, event_type: "customer_payment_confirmed", body: "Customer purchase budget is protected and waiting for admin vendor funding." });
  }
}

async function applyFastErrandTopUp(db: SupabaseClient, intent: PaymentIntent) {
  const { data: funding } = await db
    .from("transactions")
    .select("id, metadata")
    .eq("provider_reference", intent.provider_transaction_reference)
    .eq("wallet_id", intent.wallet_id)
    .maybeSingle<{ id: string; metadata?: unknown }>();
  const metadata = record(funding?.metadata);
  const errandId = typeof metadata.fast_errand_id === "string" ? metadata.fast_errand_id : "";
  if (!errandId || metadata.fast_errand_top_up !== true) return;
  const amount = intent.expected_amount_minor / 100;
  const { data: errand } = await db
    .from("fast_errand_orders")
    .select("id, customer_id, delivery_id, purchase_budget_ngn, top_up_required_ngn, status")
    .eq("id", errandId)
    .eq("customer_id", intent.owner_user_id)
    .eq("status", "top_up_required")
    .maybeSingle<{ id: string; customer_id: string; delivery_id: string; purchase_budget_ngn: number; top_up_required_ngn: number; status: string }>();
  if (!errand) return;
  const holdReference = `${intent.provider_transaction_reference}:fast-errand-hold`;
  const { data: hold } = await db.from("transactions").select("id").eq("provider_reference", holdReference).maybeSingle<{ id: string }>();
  if (hold?.id) return;
  const { data: wallet } = await db.from("wallets").select("balance_ngn").eq("id", intent.wallet_id).maybeSingle<{ balance_ngn?: number | null }>();
  if (!wallet || Number(wallet.balance_ngn || 0) < amount) return;
  await db.from("transactions").insert({
    wallet_id: intent.wallet_id,
    delivery_id: errand.delivery_id,
    transaction_type: "delivery_payment",
    amount_ngn: amount * -1,
    status: "successful",
    provider: "fast_errands",
    provider_reference: holdReference,
    description: `FastErrands top-up protected for ${errand.id}`,
    metadata: { fast_errand_id: errand.id, title: "FastErrands purchase top-up hold" }
  });
  await Promise.all([
    db.from("wallets").update({ balance_ngn: Number(wallet.balance_ngn || 0) - amount, updated_at: new Date().toISOString() }).eq("id", intent.wallet_id),
    db.from("fast_errand_orders").update({ purchase_budget_ngn: Number(errand.purchase_budget_ngn) + amount, top_up_required_ngn: 0, status: "funded_waiting_admin", updated_at: new Date().toISOString() }).eq("id", errand.id),
    db.from("fast_errand_events").insert({ errand_id: errand.id, event_type: "top_up_confirmed", body: "Customer top-up is protected and ready for admin vendor funding.", metadata: { amount_ngn: amount } })
  ]);
}

async function announceWhatsAppPayment(db: SupabaseClient, intent: PaymentIntent, fallbackCode: string) {
  if (!intent.owner_user_id) return;
  const [{ data: link }, target] = await Promise.all([
    db.from("whatsapp_account_links").select("whatsapp_phone").eq("user_id", intent.owner_user_id).maybeSingle<{ whatsapp_phone: string }>(),
    paymentTarget(db, intent)
  ]);
  const phone = target.whatsappPhone || link?.whatsapp_phone;
  if (!phone || !target.whatsappSource) return;
  await sendWhatsAppText({
    to: phone,
    body: `Payment confirmed for ${target.code || fallbackCode}. Your FastFleets order is confirmed. We will send delivery updates here in WhatsApp as it progresses.`
  });
}

async function paymentTarget(db: SupabaseClient, intent: PaymentIntent) {
  if (intent.delivery_id) {
    const { data } = await db.from("deliveries").select("delivery_code, metadata").eq("id", intent.delivery_id).maybeSingle<{ delivery_code?: string | null; metadata?: unknown }>();
    const metadata = record(data?.metadata);
    return { code: data?.delivery_code || null, whatsappSource: metadata.source === "whatsapp_ordering", whatsappPhone: stringValue(metadata.whatsapp_phone) };
  }
  if (intent.order_id) {
    const { data } = await db.from("orders").select("order_code, metadata").eq("id", intent.order_id).maybeSingle<{ order_code?: string | null; metadata?: unknown }>();
    const metadata = record(data?.metadata);
    return { code: data?.order_code || null, whatsappSource: metadata.source === "whatsapp_ordering", whatsappPhone: stringValue(metadata.whatsapp_phone) };
  }
  return { code: null, whatsappSource: false, whatsappPhone: null };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || null;
}
