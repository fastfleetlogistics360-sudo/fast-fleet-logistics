export const REFERRAL_COOKIE = "ff_referral_intent";
export const REFERRAL_COOKIE_MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

export type ReferralCampaignSlug = "customer_referral" | "cyclist_referral";

export function referralCampaignFromInput(value: unknown): ReferralCampaignSlug | null {
  if (value === "customer" || value === "customer_referral") return "customer_referral";
  if (value === "cyclist" || value === "cyclist_referral") return "cyclist_referral";
  return null;
}

export function referralCampaignQueryValue(campaign: ReferralCampaignSlug) {
  return campaign === "cyclist_referral" ? "cyclist" : "customer";
}

export function cleanReferralCode(value: unknown) {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return /^FAST-[A-Z0-9-]{8,64}$/.test(code) ? code : null;
}

export function referralIntentValue(intentId: string) {
  return JSON.stringify({ intentId });
}

export function parseReferralIntent(value: string | undefined) {
  try {
    const parsed = JSON.parse(value || "") as { intentId?: unknown };
    return typeof parsed.intentId === "string" && /^[0-9a-f-]{36}$/i.test(parsed.intentId) ? { intentId: parsed.intentId } : null;
  } catch {
    return null;
  }
}

export function referralLink(origin: string, code: string, campaign: ReferralCampaignSlug) {
  const url = new URL("/join", origin);
  url.searchParams.set("ref", code);
  url.searchParams.set("campaign", referralCampaignQueryValue(campaign));
  return url.toString();
}
