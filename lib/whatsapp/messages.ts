import { whatsappConfig } from "@/lib/whatsapp/config";

type WhatsAppTextMessage = {
  to: string;
  body: string;
};

type WhatsAppImageMessage = {
  to: string;
  imageUrl: string;
  caption: string;
};

export async function sendWhatsAppText({ to, body }: WhatsAppTextMessage) {
  const config = whatsappConfig();
  if (!config.accessToken || !config.phoneNumberId) throw new Error("WhatsApp sending is not configured.");

  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { preview_url: false, body: body.slice(0, 4096) }
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp message was rejected (${response.status}): ${detail.slice(0, 240)}`);
  }
}

export async function sendWhatsAppImage({ to, imageUrl, caption }: WhatsAppImageMessage) {
  const config = whatsappConfig();
  if (!config.accessToken || !config.phoneNumberId) throw new Error("WhatsApp sending is not configured.");
  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "image", image: { link: imageUrl, caption: caption.slice(0, 1024) } }),
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp image was rejected (${response.status}): ${detail.slice(0, 240)}`);
  }
}
