export const SUPPORT_BODY_MAX_LENGTH = 2_000;
export const SUPPORT_TURNSTILE_ACTION = "support_submit";

export type SupportPriority = "normal" | "high" | "urgent";
export type SupportSource = "form" | "widget";
export type SupportTopicKey = "delivery" | "rider_kyc" | "wallet" | "business" | "other";

export type SupportTopicPolicy = {
  label: string;
  subject: string;
  automatedReply: string;
  priority: SupportPriority;
};

export const supportTopics: Record<SupportTopicKey, SupportTopicPolicy> = {
  delivery: {
    label: "Delivery order",
    subject: "Delivery support request",
    automatedReply: "Check your tracking page first. If the rider is delayed, keep the delivery code ready so support can inspect pickup, route, and timeline events quickly.",
    priority: "high"
  },
  rider_kyc: {
    label: "Rider application",
    subject: "Rider application support request",
    automatedReply: "Most KYC delays come from unclear ID photos, missing vehicle papers, or bank details. Re-upload the correct document in Rider KYC, then ask support to review it.",
    priority: "normal"
  },
  wallet: {
    label: "Wallet and payments",
    subject: "Wallet or payment support request",
    automatedReply: "Keep the payment reference for any debit. Support can use it to review a pending wallet credit.",
    priority: "urgent"
  },
  business: {
    label: "Business dispatch",
    subject: "Business account support request",
    automatedReply: "Business setup issues are usually profile, pickup address, or team access related. Confirm your business profile is submitted before requesting manual support.",
    priority: "normal"
  },
  other: {
    label: "Something else",
    subject: "General support request",
    automatedReply: "Share the account email or phone, what you expected to happen, and what actually happened. Support can route the issue from there.",
    priority: "normal"
  }
};

const topicAliases: Record<string, SupportTopicKey> = {
  delivery: "delivery",
  "delivery order": "delivery",
  rider_kyc: "rider_kyc",
  "rider application": "rider_kyc",
  "driver kyc": "rider_kyc",
  wallet: "wallet",
  "wallet and payments": "wallet",
  "wallet/payment": "wallet",
  business: "business",
  "business dispatch": "business",
  "business account": "business",
  other: "other"
};

export function normalizeSupportTopic(value: unknown): SupportTopicKey | null {
  if (typeof value !== "string") return null;
  return topicAliases[value.trim().toLowerCase()] || null;
}

export function normalizeSupportSource(value: unknown): SupportSource | null {
  return value === "form" || value === "widget" ? value : null;
}

export function cleanSupportText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function isSupportIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function newSupportIdempotencyKey() {
  if (typeof globalThis.crypto.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
