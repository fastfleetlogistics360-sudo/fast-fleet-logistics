import { createHash, createHmac, timingSafeEqual } from "crypto";
import { getSquadSecretKey } from "@/lib/payments/squad";

export const SQUAD_WEBHOOK_SIGNATURE_HEADER = "x-squad-encrypted-body";
const SQUAD_WEBHOOK_SIGNATURE_HEX_LENGTH = 128;

export type SquadWebhookEvent = {
  eventType: string;
  providerReference: string;
  providerStatus: string;
  gatewayReference: string | null;
};

export type SquadWebhookSignatureResult =
  | { valid: true }
  | { valid: false; code: "WEBHOOK_SIGNATURE_MISSING" | "WEBHOOK_SIGNATURE_INVALID" };

/**
 * Standard Squad payments sign the exact inbound body with HMAC-SHA512. Keep
 * this separate from the virtual-account signature format.
 */
export function verifySquadWebhookSignature(rawBody: string, suppliedSignature: string | null): SquadWebhookSignatureResult {
  if (!rawBody || !suppliedSignature) return { valid: false, code: "WEBHOOK_SIGNATURE_MISSING" };

  const secret = getSquadSecretKey();
  if (!secret) return { valid: false, code: "WEBHOOK_SIGNATURE_INVALID" };

  const received = suppliedSignature.trim();
  if (!/^[a-f0-9]+$/i.test(received) || received.length !== SQUAD_WEBHOOK_SIGNATURE_HEX_LENGTH) {
    return { valid: false, code: "WEBHOOK_SIGNATURE_INVALID" };
  }

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex").toUpperCase();
  const actual = received.toUpperCase();
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");
  if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
    return { valid: false, code: "WEBHOOK_SIGNATURE_INVALID" };
  }

  return { valid: true };
}

export function parseSquadStandardPaymentWebhook(payload: unknown): SquadWebhookEvent | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  const nested = record.data && typeof record.data === "object" && !Array.isArray(record.data)
    ? (record.data as Record<string, unknown>)
    : {};
  const eventType = text(record.Event || record.event || record.type || nested.Event || nested.event);
  const providerReference = text(
    record.transaction_ref || record.transaction_reference || nested.transaction_ref || nested.transaction_reference
  );
  const providerStatus = text(
    record.transaction_status || record.status || nested.transaction_status || nested.status
  );
  const gatewayReference = text(
    record.gateway_transaction_ref || record.gateway_ref || nested.gateway_transaction_ref || nested.gateway_ref
  ) || null;

  if (!eventType || !providerReference) return null;
  return { eventType: normaliseEventType(eventType), providerReference, providerStatus, gatewayReference };
}

export function isSuccessfulSquadWebhookEvent(event: SquadWebhookEvent) {
  return event.eventType === "charge_successful";
}

export function squadWebhookPayloadDigest(rawBody: string) {
  return createHash("sha256").update(rawBody, "utf8").digest("hex");
}

/**
 * Squad's standard webhook payload has no documented immutable event id. This
 * key uses immutable payment-event fields; the full raw body is never stored.
 */
export function squadWebhookEventKey(event: SquadWebhookEvent) {
  return createHash("sha256")
    .update(["squad", event.eventType, event.providerReference, event.providerStatus.toLowerCase(), event.gatewayReference || ""].join("|"))
    .digest("hex");
}

function normaliseEventType(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function text(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
