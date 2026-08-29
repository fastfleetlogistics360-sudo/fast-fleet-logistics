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

type WhatsAppUploadedImageMessage = {
  to: string;
  bytes: ArrayBuffer;
  mimeType: string;
  fileName?: string;
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

/**
 * Uploads private image bytes directly to Meta before sending them. This avoids
 * relying on Meta being able to fetch a short-lived storage URL itself.
 */
export async function sendWhatsAppUploadedImage({ to, bytes, mimeType, fileName = "fastconfirm.jpg", caption }: WhatsAppUploadedImageMessage) {
  const config = whatsappConfig();
  if (!config.accessToken || !config.phoneNumberId) throw new Error("WhatsApp sending is not configured.");
  const safeMimeType = mimeType.startsWith("image/") ? mimeType : "image/jpeg";
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", safeMimeType);
  form.append("file", new Blob([bytes], { type: safeMimeType }), fileName);
  const upload = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}` },
    body: form,
    cache: "no-store"
  });
  if (!upload.ok) {
    const detail = await upload.text().catch(() => "");
    throw new Error(`WhatsApp media upload was rejected (${upload.status}): ${detail.slice(0, 240)}`);
  }
  const payload = await upload.json().catch(() => null) as { id?: string } | null;
  if (!payload?.id) throw new Error("WhatsApp media upload did not return a media ID.");

  const response = await fetch(`https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "image", image: { id: payload.id, caption: caption.slice(0, 1024) } }),
    cache: "no-store"
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`WhatsApp uploaded image was rejected (${response.status}): ${detail.slice(0, 240)}`);
  }
}
