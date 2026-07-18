import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentWebhookReceipt = {
  id: string;
  processing_status: "received" | "processed" | "retryable" | "ignored";
  retry_count: number;
};

export async function recordWebhookReceipt(
  db: SupabaseClient,
  input: {
    eventKey: string;
    providerReference: string | null;
    eventType: string;
    payloadDigest: string;
  }
) {
  const { data: existing, error: existingError } = await db
    .from("payment_webhook_receipts")
    .select("id, processing_status, retry_count")
    .eq("provider", "squad")
    .eq("event_key", input.eventKey)
    .maybeSingle<PaymentWebhookReceipt>();
  if (existingError) throw new Error("WEBHOOK_RECEIPT_LOOKUP_FAILED");
  if (existing) {
    if (existing.processing_status === "processed" || existing.processing_status === "ignored") {
      return { receipt: existing, duplicate: true };
    }
    const { data, error } = await db
      .from("payment_webhook_receipts")
      .update({ retry_count: Number(existing.retry_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select("id, processing_status, retry_count")
      .single<PaymentWebhookReceipt>();
    if (error) throw new Error("WEBHOOK_RECEIPT_UPDATE_FAILED");
    return { receipt: data, duplicate: true };
  }

  const { data, error } = await db
    .from("payment_webhook_receipts")
    .insert({
      provider: "squad",
      event_key: input.eventKey,
      provider_transaction_reference: input.providerReference,
      event_type: input.eventType,
      payload_digest: input.payloadDigest,
      processing_status: "received"
    })
    .select("id, processing_status, retry_count")
    .single<PaymentWebhookReceipt>();
  if (error) {
    const { data: raced } = await db
      .from("payment_webhook_receipts")
      .select("id, processing_status, retry_count")
      .eq("provider", "squad")
      .eq("event_key", input.eventKey)
      .maybeSingle<PaymentWebhookReceipt>();
    if (raced) return { receipt: raced, duplicate: true };
    throw new Error("WEBHOOK_RECEIPT_CREATE_FAILED");
  }
  return { receipt: data, duplicate: false };
}

export async function updateWebhookReceipt(
  db: SupabaseClient,
  receiptId: string,
  input: { status: PaymentWebhookReceipt["processing_status"]; failureCode?: string | null }
) {
  const { error } = await db
    .from("payment_webhook_receipts")
    .update({
      processing_status: input.status,
      failure_code: input.failureCode || null,
      processed_at: input.status === "processed" || input.status === "ignored" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    })
    .eq("id", receiptId);
  if (error) throw new Error("WEBHOOK_RECEIPT_STATUS_FAILED");
}
