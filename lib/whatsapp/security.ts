import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function newChallengeToken() {
  return randomBytes(32).toString("base64url");
}

export function verifyWhatsAppSignature(rawBody: string, signature: string | null, appSecret: string) {
  if (!signature?.startsWith("sha256=") || !appSecret) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", appSecret).update(rawBody).digest("hex")}`);
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

