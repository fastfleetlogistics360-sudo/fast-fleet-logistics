import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappConfig, whatsappIsConfigured } from "@/lib/whatsapp/config";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";
import { isPlausibleWhatsAppPhone, normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import { newChallengeToken, newWhatsAppEmailCode, sha256, verifyWhatsAppEmailCode, verifyWhatsAppSignature, whatsappEmailCodeDigest } from "@/lib/whatsapp/security";
import { sendWhatsAppAccountConfirmationEmail } from "@/lib/whatsapp/account-confirmation-email";
import { handleWhatsAppOrdering } from "@/lib/whatsapp/ordering";
import { handleWhatsAppDeliveryConfirmationReply, handleWhatsAppFastConfirmReply } from "@/lib/whatsapp/delivery-updates";
import { announceDeliveryConfirmation, createDeliveryConfirmation } from "@/lib/delivery-confirmation";
import { finalizeConfirmedDelivery, type DeliveryForCompletion } from "@/lib/delivery-completion";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

type IncomingMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
};

type IncomingMessageEnvelope = {
  message: IncomingMessage;
  recipientPhoneNumberId: string | null;
};

type Conversation = {
  whatsapp_phone: string;
  user_id?: string | null;
  state?: string | null;
  state_data?: Record<string, unknown> | null;
};

export function GET(request: NextRequest) {
  const config = whatsappConfig();
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && token && token === config.verifyToken) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Webhook verification failed." }, { status: 403 });
}

export async function POST(request: NextRequest) {
  // rate-limit-exempt: this endpoint accepts only Meta-signed webhook events and
  // deduplicates the provider message ID before any account or order action.
  const config = whatsappConfig();
  if (!whatsappIsConfigured()) return NextResponse.json({ error: "WhatsApp is not configured." }, { status: 503 });

  const rawBody = await request.text();
  if (!verifyWhatsAppSignature(rawBody, request.headers.get("x-hub-signature-256"), config.appSecret)) {
    return NextResponse.json({ error: "Invalid WhatsApp signature." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "WhatsApp database access is not configured." }, { status: 503 });

  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") {
    return NextResponse.json({ error: "Unexpected webhook object." }, { status: 400 });
  }

  const messages = incomingMessages(payload);
  const expectedPhoneNumberId = config.phoneNumberId;
  await Promise.all(messages.map(({ message, recipientPhoneNumberId }) => {
    // Meta's dashboard samples contain a demonstration phone-number ID. Acknowledge
    // them successfully without creating records or sending a response to that demo number.
    if (recipientPhoneNumberId && recipientPhoneNumberId !== expectedPhoneNumberId) return Promise.resolve();
    return processIncomingMessage(admin, message);
  }));
  return NextResponse.json({ received: true });
}

function incomingMessages(payload: unknown): IncomingMessageEnvelope[] {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) return [];
    return entry.changes.flatMap((change) => {
      const value = isRecord(change) && isRecord(change.value) ? change.value : null;
      const inbound = value?.messages;
      const metadata = value && isRecord(value.metadata) ? value.metadata : null;
      const recipientPhoneNumberId = typeof metadata?.phone_number_id === "string" ? metadata.phone_number_id : null;
      return Array.isArray(inbound)
        ? (inbound.filter(isRecord) as IncomingMessage[]).map((message) => ({ message, recipientPhoneNumberId }))
        : [];
    });
  });
}

async function processIncomingMessage(admin: NonNullable<ReturnType<typeof createAdminClient>>, message: IncomingMessage) {
  const phone = normalizeWhatsAppPhone(message.from);
  const messageId = String(message.id || "").trim();
  if (!messageId || !isPlausibleWhatsAppPhone(phone)) return;

  // Read the state before persisting so confirmation codes can be redacted from
  // both the searchable message body and provider payload retained for support.
  const conversation = await loadConversation(admin, phone);
  const text = incomingText(message);
  const codeReply = conversation?.state === "awaiting_email_code";

  const { error: receiptError } = await admin.from("whatsapp_inbound_messages").insert({
    message_id: messageId,
    whatsapp_phone: phone,
    message_type: String(message.type || "unknown").slice(0, 40),
    body: codeReply ? "[WhatsApp account confirmation code redacted]" : text.slice(0, 2000),
    payload: codeReply ? redactedMessage(message) : message
  });
  if (receiptError?.code === "23505") return;
  if (receiptError) throw receiptError;

  const { data: accountLink, error: linkError } = await admin
    .from("whatsapp_account_links")
    .select("user_id, users(full_name, email, phone)")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ user_id: string; users?: { full_name?: string | null; email?: string | null; phone?: string | null } | null }>();
  if (linkError) throw linkError;

  if (accountLink?.user_id) {
    await admin.from("whatsapp_account_links").update({ last_seen_at: new Date().toISOString() }).eq("whatsapp_phone", phone);
    const fastConfirmReply = await handleWhatsAppFastConfirmReply(admin, phone, accountLink.user_id, text.trim().toUpperCase());
    if (fastConfirmReply) {
      await sendWhatsAppText({ to: phone, body: fastConfirmReply });
      return;
    }
    const deliveryConfirmationReply = await handleWhatsAppDeliveryConfirmationReply(admin, phone, accountLink.user_id, text.trim().toUpperCase());
    if (deliveryConfirmationReply?.action === "resend") {
      const issued = await createDeliveryConfirmation(admin, deliveryConfirmationReply.delivery, { force: true });
      await announceDeliveryConfirmation(admin, deliveryConfirmationReply.delivery, issued);
      return;
    }
    if (deliveryConfirmationReply?.action === "confirm") {
      await finalizeConfirmedDelivery(admin, deliveryConfirmationReply.delivery as DeliveryForCompletion, accountLink.user_id, "customer_whatsapp");
      return;
    }
    await handleWhatsAppOrdering({
      db: admin,
      phone,
      customer: { id: accountLink.user_id, full_name: accountLink.users?.full_name, email: accountLink.users?.email, phone: accountLink.users?.phone },
      conversation,
      text
    }).then((messages) => Promise.all(messages.map((body) => sendWhatsAppText({ to: phone, body }))));
    return;
  }

  if (conversation?.state === "awaiting_email" && isEmail(text)) {
    await beginAccountLink(admin, phone, text);
    return;
  }
  if (conversation?.state === "awaiting_email_code") {
    await completeAccountLinkByCode(admin, phone, text);
    return;
  }

  await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
  await sendWhatsAppText({
    to: phone,
    body: "Welcome to FastFleets 360. To keep every order safe, please reply with the email address on your FastFleets account. Never send a password here."
  });
}

async function beginAccountLink(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string, emailInput: string) {
  const email = emailInput.trim().toLowerCase();
  const { data: user, error } = await admin.from("users").select("id, email, full_name").ilike("email", email).maybeSingle<{ id: string; email: string | null; full_name: string | null }>();
  if (error) throw error;

  if (!user?.id || !user.email) {
    await sendWhatsAppText({ to: phone, body: "We could not find a FastFleets account with that email. Create an account first at the FastFleets app, then message us again." });
    return;
  }

  const now = new Date().toISOString();
  const challengeId = randomUUID();
  const token = newChallengeToken(); // Maintains compatibility with existing challenge rows; new rows use code_digest.
  const code = newWhatsAppEmailCode();
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  const { error: invalidateError } = await admin.from("whatsapp_link_challenges").update({ consumed_at: now }).eq("whatsapp_phone", phone).is("consumed_at", null);
  if (invalidateError) throw invalidateError;
  const { error: challengeError } = await admin.from("whatsapp_link_challenges").insert({
    id: challengeId,
    token_hash: sha256(token),
    whatsapp_phone: phone,
    user_id: user.id,
    email: user.email,
    code_digest: whatsappEmailCodeDigest(challengeId, code),
    attempts: 0,
    max_attempts: 5,
    send_count: 1,
    last_sent_at: now,
    expires_at: expiresAt
  });
  if (challengeError) throw challengeError;
  await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email_code", state_data: { email_hint: emailHint(user.email) } });

  try {
    await sendWhatsAppAccountConfirmationEmail({ to: user.email, customerName: user.full_name, code, whatsappPhone: phone });
  } catch {
    await admin.from("whatsapp_link_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challengeId);
    await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
    await sendWhatsAppText({ to: phone, body: "We could not send your WhatsApp Account Confirmation email. Please try your email again shortly." });
    return;
  }

  await sendWhatsAppText({
    to: phone,
    body: "We sent a six-digit WhatsApp Account Confirmation code to your email. Reply with the code here within 10 minutes. Never send a password in WhatsApp. Reply RESEND if you need another code."
  });
}

type EmailCodeChallenge = {
  id: string;
  whatsapp_phone: string;
  user_id: string;
  email: string | null;
  code_digest: string | null;
  attempts: number;
  max_attempts: number;
  send_count: number;
  last_sent_at: string | null;
  expires_at: string;
  consumed_at: string | null;
  locked_at: string | null;
  users?: { full_name?: string | null; email?: string | null; phone?: string | null } | null;
};

async function completeAccountLinkByCode(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string, text: string) {
  const challenge = await activeEmailCodeChallenge(admin, phone);
  if (!challenge) {
    await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
    await sendWhatsAppText({ to: phone, body: "That confirmation request is no longer active. Please reply with your FastFleets account email to request a new code." });
    return;
  }

  if (text.trim().toUpperCase() === "RESEND") {
    await resendEmailCode(admin, phone, challenge);
    return;
  }

  const code = text.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) {
    await sendWhatsAppText({ to: phone, body: "Please reply with the six-digit code from your WhatsApp Account Confirmation email, or reply RESEND for a new code." });
    return;
  }
  const now = new Date();
  if (challenge.locked_at || new Date(challenge.expires_at).getTime() <= now.getTime()) {
    await admin.from("whatsapp_link_challenges").update({ consumed_at: now.toISOString() }).eq("id", challenge.id).is("consumed_at", null);
    await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
    await sendWhatsAppText({ to: phone, body: "That confirmation code has expired. Please reply with your FastFleets account email to request a new one." });
    return;
  }

  if (!challenge.code_digest || !verifyWhatsAppEmailCode(challenge.id, code, challenge.code_digest)) {
    const attempts = Number(challenge.attempts || 0) + 1;
    const locked = attempts >= Number(challenge.max_attempts || 5);
    await admin
      .from("whatsapp_link_challenges")
      .update({ attempts, locked_at: locked ? now.toISOString() : null, consumed_at: locked ? now.toISOString() : null })
      .eq("id", challenge.id)
      .is("consumed_at", null);
    if (locked) {
      await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
      await sendWhatsAppText({ to: phone, body: "Too many incorrect codes. For your security, please reply with your account email to request a new confirmation code." });
      return;
    }
    const remaining = Math.max(0, Number(challenge.max_attempts || 5) - attempts);
    await sendWhatsAppText({ to: phone, body: `That code is not correct. Please try again. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.` });
    return;
  }

  const { data: existingLink, error: existingError } = await admin
    .from("whatsapp_account_links")
    .select("user_id")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ user_id: string }>();
  if (existingError || (existingLink && existingLink.user_id !== challenge.user_id)) {
    await sendWhatsAppText({ to: phone, body: "This WhatsApp number is already connected to another FastFleets account. Please contact support for help." });
    return;
  }

  const nowIso = now.toISOString();
  const { error: consumedError } = await admin
    .from("whatsapp_link_challenges")
    .update({ consumed_at: nowIso })
    .eq("id", challenge.id)
    .is("consumed_at", null);
  if (consumedError) throw consumedError;
  const { error: linkError } = await admin.from("whatsapp_account_links").upsert({
    whatsapp_phone: phone,
    user_id: challenge.user_id,
    verified_at: nowIso,
    last_seen_at: nowIso
  }, { onConflict: "whatsapp_phone" });
  if (linkError) throw linkError;

  await upsertConversation(admin, { whatsapp_phone: phone, user_id: challenge.user_id, state: "ready", state_data: {} });
  await sendWhatsAppText({
    to: phone,
    body: `WhatsApp Account Confirmation complete. Welcome, ${firstName(challenge.users?.full_name)}.\n\nReply MARKETPLACE to order food or shopping, or DISPATCH to book a delivery. Your confirmed WhatsApp orders will appear in your FastFleets app history.`
  });
}

async function resendEmailCode(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string, challenge: EmailCodeChallenge) {
  const now = new Date();
  const previousSentAt = challenge.last_sent_at ? new Date(challenge.last_sent_at).getTime() : 0;
  const cooldownMs = 60_000;
  if (previousSentAt && now.getTime() - previousSentAt < cooldownMs) {
    const seconds = Math.max(1, Math.ceil((cooldownMs - (now.getTime() - previousSentAt)) / 1000));
    await sendWhatsAppText({ to: phone, body: `Please wait ${seconds} seconds before requesting another code.` });
    return;
  }
  if (Number(challenge.send_count || 1) >= 3 || !challenge.email) {
    await admin.from("whatsapp_link_challenges").update({ consumed_at: now.toISOString() }).eq("id", challenge.id).is("consumed_at", null);
    await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email", state_data: {} });
    await sendWhatsAppText({ to: phone, body: "The code resend limit has been reached. Please reply with your account email to start a fresh confirmation request." });
    return;
  }

  const code = newWhatsAppEmailCode();
  const nowIso = now.toISOString();
  const { error } = await admin
    .from("whatsapp_link_challenges")
    .update({ code_digest: whatsappEmailCodeDigest(challenge.id, code), attempts: 0, send_count: Number(challenge.send_count || 1) + 1, last_sent_at: nowIso, expires_at: new Date(now.getTime() + 10 * 60_000).toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null);
  if (error) throw error;
  try {
    await sendWhatsAppAccountConfirmationEmail({ to: challenge.email, customerName: challenge.users?.full_name, code, whatsappPhone: phone });
    await sendWhatsAppText({ to: phone, body: "A new six-digit WhatsApp Account Confirmation code has been sent. Reply with it here within 10 minutes." });
  } catch {
    await sendWhatsAppText({ to: phone, body: "We could not send a new email code right now. Please try RESEND again shortly." });
  }
}

async function activeEmailCodeChallenge(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string) {
  const { data, error } = await admin
    .from("whatsapp_link_challenges")
    .select("id, whatsapp_phone, user_id, email, code_digest, attempts, max_attempts, send_count, last_sent_at, expires_at, consumed_at, locked_at, users(full_name, email, phone)")
    .eq("whatsapp_phone", phone)
    .is("consumed_at", null)
    .not("code_digest", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<EmailCodeChallenge>();
  if (error) throw error;
  return data;
}

async function loadConversation(admin: NonNullable<ReturnType<typeof createAdminClient>>, phone: string) {
  const { data, error } = await admin.from("whatsapp_conversations").select("whatsapp_phone, user_id, state, state_data").eq("whatsapp_phone", phone).maybeSingle<Conversation>();
  if (error) throw error;
  return data;
}

async function upsertConversation(admin: NonNullable<ReturnType<typeof createAdminClient>>, conversation: Conversation) {
  const { error } = await admin.from("whatsapp_conversations").upsert({
    ...conversation,
    last_message_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }, { onConflict: "whatsapp_phone" });
  if (error) throw error;
}

function incomingText(message: IncomingMessage) {
  const location = message.location;
  if (location && typeof location.latitude === "number" && typeof location.longitude === "number") {
    return [location.name, location.address, `${location.latitude}, ${location.longitude}`].filter(Boolean).join(", ");
  }
  return String(
    message.text?.body || message.button?.payload || message.button?.text || message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || message.interactive?.list_reply?.id || message.interactive?.list_reply?.title || ""
  ).trim();
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function emailHint(value: string) {
  const [local, domain] = value.split("@");
  if (!local || !domain) return "your email";
  return `${local.slice(0, 2)}•••@${domain}`;
}

function redactedMessage(message: IncomingMessage) {
  const clone: IncomingMessage = { ...message };
  if (clone.text) clone.text = { ...clone.text, body: "[redacted]" };
  if (clone.button) clone.button = { ...clone.button, payload: "[redacted]", text: "[redacted]" };
  return clone;
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
