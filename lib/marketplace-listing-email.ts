type MarketplaceListingEmailInput = {
  storeName: string;
  storeCategory: string;
  commissionRate: number | null;
  itemCount: number;
  expectedAverageOrders: string;
  contactEmail: string;
  whatsappNumber: string;
  businessName: string;
  businessProfileId: string;
  applicationId: string;
};

const marketplaceListingRecipient = "olasunkannmijoshua765@gmail.com";

export async function sendMarketplaceListingRequestEmail(input: MarketplaceListingEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "RESEND_API_KEY is not configured." };

  const from = process.env.FASTFLEET_EMAIL_FROM || "Fast Fleets 360 <onboarding@resend.dev>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: marketplaceListingRecipient,
      subject: `Marketplace listing request: ${input.storeName}`,
      text: [
        "A business submitted a marketplace listing request.",
        "",
        `Store name: ${input.storeName}`,
        `Business profile: ${input.businessName} (${input.businessProfileId})`,
        `Application ID: ${input.applicationId}`,
        `Store category: ${input.storeCategory}`,
        `Commission rate: ${input.commissionRate == null ? "Not set" : `${input.commissionRate}%`}`,
        `Number of intended items: ${input.itemCount}`,
        `Expected average orders: ${input.expectedAverageOrders}`,
        `Email: ${input.contactEmail}`,
        `WhatsApp: ${input.whatsappNumber}`
      ].join("\n")
    })
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { sent: false, reason: String(body.message || "Resend rejected the email request.") };
  }

  return { sent: true, reason: null };
}
