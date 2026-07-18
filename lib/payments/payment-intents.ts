import type { SupabaseClient } from "@supabase/supabase-js";
import { toMinorAmount } from "@/lib/payments/squad";

export type PaymentIntentPurpose =
  | "delivery_payment"
  | "marketplace_business_order"
  | "marketplace_delivery_payment"
  | "wallet_funding";

export type PaymentIntentStatus = "initialized" | "pending" | "settled" | "failed" | "requires_review";

export type PaymentIntent = {
  id: string;
  provider: "squad";
  provider_transaction_reference: string;
  internal_reference: string;
  purpose: PaymentIntentPurpose;
  owner_user_id: string;
  expected_amount_minor: number;
  currency: string;
  status: PaymentIntentStatus;
  delivery_id: string | null;
  order_id: string | null;
  wallet_id: string | null;
  provider_status: string | null;
  settlement_attempt_count: number;
  last_verified_at: string | null;
  settled_at: string | null;
  failed_at: string | null;
  failure_code: string | null;
  source: "checkout" | "legacy";
};

export type CreatePaymentIntentInput = {
  reference: string;
  internalReference: string;
  purpose: PaymentIntentPurpose;
  ownerUserId: string;
  amountNgn: number;
  currency?: string;
  deliveryId?: string | null;
  orderId?: string | null;
  walletId?: string | null;
  source?: "checkout" | "legacy";
};

export class PaymentIntentError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
  }
}

export function paymentIntentReferenceIsSafe(reference: string) {
  return /^[A-Za-z0-9._:-]{8,160}$/.test(reference);
}

export async function createPaymentIntent(db: SupabaseClient, input: CreatePaymentIntentInput): Promise<PaymentIntent> {
  const currency = String(input.currency || "NGN").trim().toUpperCase();
  const expectedAmountMinor = toMinorAmount(input.amountNgn);
  validateCreateInput({ ...input, currency, expectedAmountMinor });

  const { data, error } = await db
    .from("payment_intents")
    .insert({
      provider: "squad",
      provider_transaction_reference: input.reference,
      internal_reference: input.internalReference,
      purpose: input.purpose,
      owner_user_id: input.ownerUserId,
      expected_amount_minor: expectedAmountMinor,
      currency,
      status: "initialized",
      delivery_id: input.deliveryId || null,
      order_id: input.orderId || null,
      wallet_id: input.walletId || null,
      source: input.source || "checkout"
    })
    .select(paymentIntentSelection)
    .single<PaymentIntent>();
  if (error) throw new PaymentIntentError("Could not create payment intent.", "PAYMENT_INTENT_CREATE_FAILED");
  return data;
}

export async function loadPaymentIntent(db: SupabaseClient, reference: string) {
  const { data, error } = await db
    .from("payment_intents")
    .select(paymentIntentSelection)
    .eq("provider", "squad")
    .eq("provider_transaction_reference", reference)
    .maybeSingle<PaymentIntent>();
  if (error) throw new PaymentIntentError("Could not load payment intent.", "PAYMENT_INTENT_LOOKUP_FAILED");
  return data;
}

export async function markPaymentIntentPending(db: SupabaseClient, intentId: string) {
  const { error } = await db
    .from("payment_intents")
    .update({ status: "pending", failure_code: null, failed_at: null, updated_at: new Date().toISOString() })
    .eq("id", intentId)
    .eq("status", "initialized");
  if (error) throw new PaymentIntentError("Could not activate payment intent.", "PAYMENT_INTENT_PENDING_FAILED");
}

export async function markPaymentIntentInitializationFailed(db: SupabaseClient, intentId: string) {
  const { error } = await db
    .from("payment_intents")
    .update({
      status: "failed",
      failure_code: "PAYMENT_INITIALIZATION_FAILED",
      failed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", intentId)
    .in("status", ["initialized", "pending"]);
  if (error) throw new PaymentIntentError("Could not close failed payment intent.", "PAYMENT_INTENT_FAILURE_UPDATE_FAILED");
}

export async function findPaymentIntentById(db: SupabaseClient, intentId: string) {
  const { data, error } = await db
    .from("payment_intents")
    .select(paymentIntentSelection)
    .eq("id", intentId)
    .maybeSingle<PaymentIntent>();
  if (error) throw new PaymentIntentError("Could not load payment intent.", "PAYMENT_INTENT_LOOKUP_FAILED");
  return data;
}

export const paymentIntentSelection = [
  "id",
  "provider",
  "provider_transaction_reference",
  "internal_reference",
  "purpose",
  "owner_user_id",
  "expected_amount_minor",
  "currency",
  "status",
  "delivery_id",
  "order_id",
  "wallet_id",
  "provider_status",
  "settlement_attempt_count",
  "last_verified_at",
  "settled_at",
  "failed_at",
  "failure_code",
  "source"
].join(", ");

function validateCreateInput(input: CreatePaymentIntentInput & { currency: string; expectedAmountMinor: number }) {
  if (!paymentIntentReferenceIsSafe(input.reference) || !paymentIntentReferenceIsSafe(input.internalReference)) {
    throw new PaymentIntentError("Invalid payment reference.", "PAYMENT_REFERENCE_INVALID");
  }
  if (!input.ownerUserId || !Number.isSafeInteger(input.expectedAmountMinor) || input.expectedAmountMinor <= 0) {
    throw new PaymentIntentError("Invalid payment amount.", "PAYMENT_AMOUNT_INVALID");
  }
  if (input.currency !== "NGN") {
    throw new PaymentIntentError("Unsupported payment currency.", "PAYMENT_CURRENCY_INVALID");
  }

  const relatedIds = [input.deliveryId, input.orderId, input.walletId].filter(Boolean);
  if (relatedIds.length !== 1) {
    throw new PaymentIntentError("Payment intent must have one trusted target.", "PAYMENT_TARGET_INVALID");
  }
  if (
    (input.purpose === "marketplace_business_order" && !input.orderId) ||
    (input.purpose === "wallet_funding" && !input.walletId) ||
    ((input.purpose === "delivery_payment" || input.purpose === "marketplace_delivery_payment") && !input.deliveryId)
  ) {
    throw new PaymentIntentError("Payment intent purpose does not match its target.", "PAYMENT_PURPOSE_INVALID");
  }
}
