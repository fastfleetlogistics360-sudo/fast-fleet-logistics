import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newChallengeToken() {
  return randomBytes(32).toString("base64url");
}

/** A short code for a customer to repeat in the WhatsApp conversation. */
export function newWhatsAppEmailCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/**
 * A code is never stored as plaintext. Binding the digest to the challenge ID
 * prevents a digest copied from one request being useful for another request.
 */
export function whatsappEmailCodeDigest(challengeId: string, code: string) {
  return createHmac("sha256", whatsappEmailConfirmationKey())
    .update(`whatsapp-email-confirmation:${challengeId}:${code}`)
    .digest("hex");
}

export function verifyWhatsAppEmailCode(challengeId: string, code: string, expectedDigest: string) {
  if (!/^\d{6}$/.test(code) || !/^[a-f0-9]{64}$/i.test(expectedDigest)) return false;
  const expected = Buffer.from(expectedDigest, "hex");
  const actual = Buffer.from(whatsappEmailCodeDigest(challengeId, code), "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

function whatsappEmailConfirmationKey() {
  const secret = process.env.WHATSAPP_EMAIL_CONFIRMATION_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "";
  if (secret.length < 32) throw new Error("WhatsApp email confirmation is not configured.");
  return createHash("sha256").update(secret).digest();
}
