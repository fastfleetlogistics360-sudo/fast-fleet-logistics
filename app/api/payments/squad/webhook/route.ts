import { NextResponse } from "next/server";
import { parseSquadStandardPaymentWebhook, isSuccessfulSquadWebhookEvent, squadWebhookEventKey, squadWebhookPayloadDigest, verifySquadWebhookSignature } from "@/lib/payments/squad-webhook";
import { settleSquadPayment, PaymentSettlementError } from "@/lib/payments/settlement";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordWebhookReceipt, updateWebhookReceipt } from "@/lib/payments/webhook-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BODY_BYTES = 128 * 1024;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return response({ received: false }, 413);
  }

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) {
    return response({ received: false }, 413);
  }

  const signature = verifySquadWebhookSignature(rawBody, request.headers.get("x-squad-encrypted-body"));
  if (!signature.valid) return response({ received: false }, signature.code === "WEBHOOK_SIGNATURE_MISSING" ? 401 : 401);

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return response({ received: false }, 400);
  }

  const event = parseSquadStandardPaymentWebhook(payload);
  if (!event) return response({ received: false }, 400);

  const db = createAdminClient();
  if (!db) return response({ received: false }, 503);

  // Only authenticated provider traffic consumes the shared ingress bucket.
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentWebhook, name: "payments:squad-webhook" });
  if (limited) {
    limited.headers.set("Cache-Control", "no-store");
    return limited;
  }

  try {
    const receiptResult = await recordWebhookReceipt(db, {
      eventKey: squadWebhookEventKey(event),
      providerReference: event.providerReference || null,
      eventType: event.eventType,
      payloadDigest: squadWebhookPayloadDigest(rawBody)
    });
    const receipt = receiptResult.receipt;

    if (receipt.processing_status === "processed" || receipt.processing_status === "ignored") {
      return response({ received: true }, 200);
    }

    if (!isSuccessfulSquadWebhookEvent(event)) {
      await updateWebhookReceipt(db, receipt.id, { status: "ignored", failureCode: "WEBHOOK_EVENT_UNSUPPORTED" });
      return response({ received: true }, 202);
    }

    const result = await settleSquadPayment(db, { reference: event.providerReference, actor: { type: "webhook" } });
    if (result.status === "retryable") {
      await updateWebhookReceipt(db, receipt.id, { status: "retryable", failureCode: result.code });
      return response({ received: false }, 503);
    }

    const receiptStatus = result.status === "settled" || result.status === "already_settled" ? "processed" : "ignored";
    await updateWebhookReceipt(db, receipt.id, { status: receiptStatus, failureCode: receiptStatus === "ignored" ? result.code : null });
    return response({ received: true }, 200);
  } catch (error) {
    // Do not disclose provider data, signatures, or database details to the caller.
    if (error instanceof PaymentSettlementError) return response({ received: false }, 503);
    return response({ received: false }, 503);
  }
}

function response(body: { received: boolean }, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
