export type AutomationProvider = "instagram" | "zoho_campaigns";
export type ProviderAvailability = { available: false; code: "NOT_CONNECTED" | "FEATURE_DISABLED"; message: string };
export type PublishingAdapter = { provider: AutomationProvider; publish(): Promise<ProviderAvailability> };

const unavailable = (provider: AutomationProvider): PublishingAdapter => ({
  provider,
  async publish() { return { available: false, code: "NOT_CONNECTED", message: `${provider === "instagram" ? "Instagram Business" : "Zoho Campaigns"} is not connected. Phase 1A does not send or publish.` }; }
});

export const instagramPublishingAdapter = unavailable("instagram");
export const zohoCampaignsAdapter = unavailable("zoho_campaigns");
