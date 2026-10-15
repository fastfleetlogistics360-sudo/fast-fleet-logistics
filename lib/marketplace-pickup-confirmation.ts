import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

export const PICKUP_CONFIRMATION_MAX_ATTEMPTS = 5;
// A code is issued before payment so it is ready as soon as the vendor marks
// the paid order ready.  It must nevertheless have a bounded lifetime and be
// rejected by both the application and the completion RPC after that time.
export const MARKETPLACE_PICKUP_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PickupConfirmation = {
  order_id: string;
  code_digest: string;
  code_ciphertext: string;
  status: "pending" | "verified" | "expired" | "locked" | "replaced";
  attempts: number;
  max_attempts: number;
  expires_at: string;
};

export function issueMarketplacePickupCode(orderId: string, now = new Date()) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  return {
    code,
    code_digest: digestMarketplacePickupCode(code, orderId),
    code_ciphertext: encryptMarketplacePickupCode(code, orderId),
    max_attempts: PICKUP_CONFIRMATION_MAX_ATTEMPTS,
    expires_at: new Date(now.getTime() + MARKETPLACE_PICKUP_CODE_TTL_MS).toISOString()
  };
}

export function marketplacePickupCodeExpired(confirmation: Pick<PickupConfirmation, "expires_at">, now = Date.now()) {
  const expiresAt = Date.parse(confirmation.expires_at);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

export function normalizeMarketplacePickupCode(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 6) : "";
}

export function verifyMarketplacePickupCode(code: string, orderId: string, digest: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = Buffer.from(digestMarketplacePickupCode(code, orderId), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function revealMarketplacePickupCode(record: PickupConfirmation) {
  if (record.status !== "pending") return null;
  return decryptMarketplacePickupCode(record.code_ciphertext, record.order_id);
}

function digestMarketplacePickupCode(code: string, orderId: string) {
  return createHmac("sha256", pickupKey()).update(`marketplace-pickup:${orderId}:code:${code}`).digest("hex");
}

function encryptMarketplacePickupCode(code: string, orderId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pickupKey(), iv);
  cipher.setAAD(Buffer.from(orderId));
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptMarketplacePickupCode(payload: string, orderId: string) {
  const [iv, tag, encrypted] = payload.split(".");
  if (!iv || !tag || !encrypted) throw new Error("Pickup code is unavailable.");
  const decipher = createDecipheriv("aes-256-gcm", pickupKey(), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(orderId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}

function pickupKey() {
  const secret = process.env.DELIVERY_CONFIRMATION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (secret.trim().length < 32) throw new Error("Pickup confirmation is not configured.");
  return createHash("sha256").update(secret).digest();
}
