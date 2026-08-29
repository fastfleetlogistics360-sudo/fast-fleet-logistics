import { createHmac, timingSafeEqual } from "crypto";
import { whatsappConfig } from "@/lib/whatsapp/config";

/**
 * A payment-return token is deliberately scoped to one provider reference.
 * It lets the payment browser confirm a WhatsApp-originated checkout without
 * requiring the customer to have an app session in that browser.
 */
export function whatsappPaymentReturnToken(reference: string) {
  const secret = whatsappConfig().appSecret;
  if (secret.length < 32) throw new Error("WhatsApp payment return is not configured.");
  return createHmac("sha256", secret).update(`whatsapp-payment-return:${reference}`).digest("hex");
}

export function verifyWhatsAppPaymentReturnToken(reference: string, token: string | null | undefined) {
  const supplied = String(token || "").trim();
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const expected = Buffer.from(whatsappPaymentReturnToken(reference), "hex");
  const actual = Buffer.from(supplied, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function whatsappConversationUrl() {
  const phone = whatsappConfig().businessPhone.replace(/\D/g, "");
  return phone.length >= 7 ? `https://wa.me/${phone}` : null;
}

export function assertWhatsAppPaymentReturnConfigured() {
  const url = whatsappConversationUrl();
  if (!url) throw new Error("WHATSAPP_BUSINESS_PHONE is not configured.");
  return url;
}
