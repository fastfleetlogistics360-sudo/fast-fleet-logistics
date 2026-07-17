import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { accountMessengerHref } from "@/lib/tracking-links";

export const DELIVERY_CONFIRMATION_STATUS = "awaiting_delivery_confirmation" as const;
export const DELIVERY_CONFIRMATION_TTL_MS = 15 * 60 * 1000;
export const DELIVERY_CONFIRMATION_RESEND_COOLDOWN_MS = 60 * 1000;
export const DELIVERY_CONFIRMATION_MAX_ATTEMPTS = 5;
export const DELIVERY_CONFIRMATION_MAX_SENDS = 4;

export type DeliveryConfirmationRecord = {
  id?: string;
  delivery_id: string;
  code_digest: string;
  code_ciphertext: string;
  status: "pending" | "verified" | "expired" | "locked" | "replaced";
  attempts: number;
  max_attempts: number;
  send_count: number;
  recipient_phone_last4?: string | null;
  expires_at: string;
  last_sent_at: string;
  verified_at?: string | null;
  verified_by?: string | null;
  verification_method?: string | null;
  created_at?: string;
  updated_at?: string;
};

export type DeliveryConfirmationTarget = {
  id: string;
  delivery_code?: string | null;
  customer_id?: string | null;
  dropoff_contact?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type IssuedDeliveryConfirmation = {
  code: string;
  expiresAt: string;
  lastSentAt: string;
  sendCount: number;
  recipientPhoneLast4: string | null;
};

export async function createDeliveryConfirmation(
  db: SupabaseClient,
  delivery: DeliveryConfirmationTarget,
  options: { force?: boolean } = {}
): Promise<IssuedDeliveryConfirmation> {
  const now = new Date();
  const { data: existing, error: existingError } = await db
    .from("delivery_confirmations")
    .select("delivery_id, code_digest, code_ciphertext, status, attempts, max_attempts, send_count, recipient_phone_last4, expires_at, last_sent_at")
    .eq("delivery_id", delivery.id)
    .maybeSingle<DeliveryConfirmationRecord>();
  if (existingError) throw existingError;

  if (existing?.status === "pending" && new Date(existing.expires_at).getTime() > now.getTime() && !options.force) {
    return {
      code: decryptDeliveryPin(existing.code_ciphertext, delivery.id),
      expiresAt: existing.expires_at,
      lastSentAt: existing.last_sent_at,
      sendCount: Number(existing.send_count || 1),
      recipientPhoneLast4: existing.recipient_phone_last4 || null
    };
  }

  const previousSentAt = existing?.last_sent_at ? new Date(existing.last_sent_at).getTime() : 0;
  if (options.force && previousSentAt && now.getTime() - previousSentAt < DELIVERY_CONFIRMATION_RESEND_COOLDOWN_MS) {
    const seconds = Math.max(1, Math.ceil((DELIVERY_CONFIRMATION_RESEND_COOLDOWN_MS - (now.getTime() - previousSentAt)) / 1000));
    throw new Error(`Wait ${seconds} seconds before requesting another delivery PIN.`);
  }
  const sendCount = Number(existing?.send_count || 0) + 1;
  if (sendCount > DELIVERY_CONFIRMATION_MAX_SENDS) {
    throw new Error("The delivery PIN resend limit has been reached. Contact support for help with this handoff.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + DELIVERY_CONFIRMATION_TTL_MS).toISOString();
  const recipientPhone = extractNigerianPhone(delivery.dropoff_contact);
  const record = {
    delivery_id: delivery.id,
    code_digest: digestDeliveryPin(code, delivery.id),
    code_ciphertext: encryptDeliveryPin(code, delivery.id),
    status: "pending",
    attempts: 0,
    max_attempts: DELIVERY_CONFIRMATION_MAX_ATTEMPTS,
    send_count: sendCount,
    recipient_phone_last4: recipientPhone ? recipientPhone.slice(-4) : null,
    expires_at: expiresAt,
    last_sent_at: now.toISOString(),
    verified_at: null,
    verified_by: null,
    verification_method: null,
    updated_at: now.toISOString()
  };
  const { error } = await db.from("delivery_confirmations").upsert(record, { onConflict: "delivery_id" });
  if (error) throw error;

  return {
    code,
    expiresAt,
    lastSentAt: now.toISOString(),
    sendCount,
    recipientPhoneLast4: record.recipient_phone_last4
  };
}

export async function announceDeliveryConfirmation(
  db: SupabaseClient,
  delivery: DeliveryConfirmationTarget,
  issued: IssuedDeliveryConfirmation
) {
  const deliveryCode = delivery.delivery_code || delivery.id;
  const owners = deliveryConfirmationOwnerIds(delivery);
  const recipientPhone = extractNigerianPhone(delivery.dropoff_contact);
  const notifications = owners.map((userId) =>
    insertNotificationWithPush(db, {
      user_id: userId,
      title: "Delivery confirmation required",
      body: `${deliveryCode} is at the drop-off point. Open the messenger to confirm the handoff or view the delivery PIN.`,
      type: "delivery_confirmation",
      metadata: {
        delivery_id: delivery.id,
        delivery_code: deliveryCode,
        status: DELIVERY_CONFIRMATION_STATUS,
        url: accountMessengerHref(deliveryCode),
        tag: `ff-confirm-${deliveryCode}`
      }
    })
  );
  const results = await Promise.allSettled([
    ...notifications,
    recipientPhone ? sendDeliveryPinSms(recipientPhone, deliveryCode, issued.code) : Promise.resolve(false)
  ]);
  const smsResult = results.at(-1);
  return { smsSent: smsResult?.status === "fulfilled" && smsResult.value === true };
}

export async function loadDeliveryConfirmation(db: SupabaseClient, deliveryId: string) {
  const { data, error } = await db
    .from("delivery_confirmations")
    .select("delivery_id, code_digest, code_ciphertext, status, attempts, max_attempts, send_count, recipient_phone_last4, expires_at, last_sent_at, verified_at, verified_by, verification_method")
    .eq("delivery_id", deliveryId)
    .maybeSingle<DeliveryConfirmationRecord>();
  if (error) throw error;
  return data || null;
}

export function revealDeliveryPin(record: DeliveryConfirmationRecord) {
  if (record.status !== "pending" || deliveryConfirmationExpired(record)) return null;
  return decryptDeliveryPin(record.code_ciphertext, record.delivery_id);
}

export function verifyDeliveryPin(code: string, record: DeliveryConfirmationRecord) {
  if (!/^\d{6}$/.test(code) || record.status !== "pending" || deliveryConfirmationExpired(record)) return false;
  const expected = Buffer.from(record.code_digest, "hex");
  const actual = Buffer.from(digestDeliveryPin(code, record.delivery_id), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function deliveryConfirmationExpired(record: DeliveryConfirmationRecord, now = Date.now()) {
  const expiresAt = new Date(record.expires_at).getTime();
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function deliveryConfirmationOwnerIds(delivery: DeliveryConfirmationTarget) {
  const metadata = metadataRecord(delivery.metadata);
  const marketplaceCustomerId = stringValue(metadata.marketplace_customer_id);
  const candidates = marketplaceCustomerId ? [marketplaceCustomerId] : [delivery.customer_id];
  return candidates.filter(
    (value, index, values): value is string => Boolean(value) && values.indexOf(value) === index
  );
}

export function userCanConfirmDelivery(delivery: DeliveryConfirmationTarget, userId: string) {
  return deliveryConfirmationOwnerIds(delivery).includes(userId);
}

export function extractNigerianPhone(value: unknown) {
  if (typeof value !== "string") return null;
  const compact = value.replace(/[()\s-]+/g, "");
  const match = compact.match(/(?:\+?234[789][01]\d{8}|0[789][01]\d{8})/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, "");
  if (digits.startsWith("234")) return `+${digits}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1)}`;
  return null;
}

export function normalizeDeliveryPin(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 6) : "";
}

function digestDeliveryPin(code: string, deliveryId: string) {
  return createHmac("sha256", confirmationKey()).update(`delivery:${deliveryId}:pin:${code}`).digest("hex");
}

function encryptDeliveryPin(code: string, deliveryId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", confirmationKey(), iv);
  cipher.setAAD(Buffer.from(deliveryId));
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptDeliveryPin(payload: string, deliveryId: string) {
  const [ivValue, tagValue, encryptedValue] = payload.split(".");
  if (!ivValue || !tagValue || !encryptedValue) throw new Error("Delivery PIN data is invalid. Request a new PIN.");
  const decipher = createDecipheriv("aes-256-gcm", confirmationKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAAD(Buffer.from(deliveryId));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
}

function confirmationKey() {
  const secret = process.env.DELIVERY_CONFIRMATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret.trim().length < 32) throw new Error("Delivery confirmation is not configured.");
  return createHash("sha256").update(secret).digest();
}

async function sendDeliveryPinSms(phone: string, deliveryCode: string, code: string) {
  const endpoint = process.env.DELIVERY_SMS_WEBHOOK_URL?.trim();
  if (!endpoint) return false;
  const token = process.env.DELIVERY_SMS_WEBHOOK_TOKEN?.trim();
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({
      event: "delivery_confirmation",
      to: phone,
      deliveryCode,
      message: `Fast Fleets 360: Your delivery PIN for ${deliveryCode} is ${code}. Share it only after receiving your package.`
    }),
    signal: AbortSignal.timeout(8_000)
  }).catch(() => null);
  return Boolean(response?.ok);
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
