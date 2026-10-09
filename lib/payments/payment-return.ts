import { createHmac, timingSafeEqual } from "crypto";
import { getSquadSecretKey } from "@/lib/payments/squad";

const RETURN_TOKEN_PARAM = "paymentReturnToken";
const RETURN_TOKEN_CONTEXT = "fastfleet-payment-return:v1";

/**
 * Adds a short, reference-bound proof to a provider callback URL. The browser
 * that completes a bank payment does not share the authenticated Capacitor
 * WebView session, so the return page needs a safe way to ask the server to
 * re-check this specific payment. Settlement still verifies the amount,
 * reference, currency and successful status with Squad before recording it.
 */
export function addPaymentReturnToken(callbackUrl: URL, reference: string) {
  const token = createPaymentReturnToken(reference);
  if (token) callbackUrl.searchParams.set(RETURN_TOKEN_PARAM, token);
  return callbackUrl;
}

export function hasValidPaymentReturnToken(request: Request, reference: string) {
  const supplied = new URL(request.url).searchParams.get(RETURN_TOKEN_PARAM) || "";
  const expected = createPaymentReturnToken(reference);
  if (!supplied || !expected) return false;

  const suppliedBuffer = Buffer.from(supplied, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function createPaymentReturnToken(reference: string) {
  const secret = getSquadSecretKey();
  const normalizedReference = reference.trim();
  if (!secret || !normalizedReference) return "";
  return createHmac("sha256", secret).update(`${RETURN_TOKEN_CONTEXT}:${normalizedReference}`, "utf8").digest("base64url");
}
