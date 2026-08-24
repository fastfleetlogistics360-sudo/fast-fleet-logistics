import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whatsappConfig, whatsappIsConfigured } from "@/lib/whatsapp/config";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";
import { isPlausibleWhatsAppPhone, normalizeWhatsAppPhone } from "@/lib/whatsapp/phone";
import { newChallengeToken, sha256, verifyWhatsAppSignature } from "@/lib/whatsapp/security";

export const runtime = "nodejs";

type IncomingMessage = {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
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
  await Promise.all(messages.map((message) => processIncomingMessage(admin, message)));
  return NextResponse.json({ received: true });
}

function incomingMessages(payload: unknown): IncomingMessage[] {
  if (!isRecord(payload) || !Array.isArray(payload.entry)) return [];
  return payload.entry.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) return [];
    return entry.changes.flatMap((change) => {
      const value = isRecord(change) && isRecord(change.value) ? change.value : null;
      const inbound = value?.messages;
      return Array.isArray(inbound) ? inbound.filter(isRecord) as IncomingMessage[] : [];
    });
  });
}

async function processIncomingMessage(admin: NonNullable<ReturnType<typeof createAdminClient>>, message: IncomingMessage) {
  const phone = normalizeWhatsAppPhone(message.from);
  const messageId = String(message.id || "").trim();
  if (!messageId || !isPlausibleWhatsAppPhone(phone)) return;

  const { error: receiptError } = await admin.from("whatsapp_inbound_messages").insert({
    message_id: messageId,
    whatsapp_phone: phone,
    message_type: String(message.type || "unknown").slice(0, 40),
    body: incomingText(message).slice(0, 2000),
    payload: message
  });
  if (receiptError?.code === "23505") return;
  if (receiptError) throw receiptError;

  const { data: accountLink, error: linkError } = await admin
    .from("whatsapp_account_links")
    .select("user_id, users(full_name)")
    .eq("whatsapp_phone", phone)
    .maybeSingle<{ user_id: string; users?: { full_name?: string | null } | null }>();
  if (linkError) throw linkError;

  if (accountLink?.user_id) {
    await admin.from("whatsapp_account_links").update({ last_seen_at: new Date().toISOString() }).eq("whatsapp_phone", phone);
    await upsertConversation(admin, { whatsapp_phone: phone, user_id: accountLink.user_id, state: "ready", state_data: {} });
    await replyForKnownCustomer(phone, firstName(accountLink.users?.full_name), incomingText(message));
    return;
  }

  const conversation = await loadConversation(admin, phone);
  const text = incomingText(message);
  if (conversation?.state === "awaiting_email" && isEmail(text)) {
    await beginAccountLink(admin, phone, text);
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
  const { data: user, error } = await admin.from("users").select("id, email").ilike("email", email).maybeSingle<{ id: string; email: string | null }>();
  if (error) throw error;

  if (!user?.id || !user.email) {
    await sendWhatsAppText({ to: phone, body: "We could not find a FastFleets account with that email. Create an account first at the FastFleets app, then message us again." });
    return;
  }

  const token = newChallengeToken();
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  await admin.from("whatsapp_link_challenges").insert({
    token_hash: sha256(token),
    whatsapp_phone: phone,
    user_id: user.id,
    expires_at: expiresAt
  });
  await upsertConversation(admin, { whatsapp_phone: phone, state: "awaiting_email_link", state_data: {} });

  const config = whatsappConfig();
  const emailRedirectTo = new URL("/auth/confirm", config.siteUrl);
  emailRedirectTo.searchParams.set("returnTo", `/auth/whatsapp/complete?challenge=${encodeURIComponent(token)}`);
  const supabase = await createClient();
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email: user.email,
    options: { emailRedirectTo: emailRedirectTo.toString(), shouldCreateUser: false }
  });
  if (otpError) throw otpError;

  await sendWhatsAppText({
    to: phone,
    body: "Check your email for the secure FastFleets sign-in link. Open it within 15 minutes to connect this WhatsApp number. We will welcome you here once it is complete."
  });
}

async function replyForKnownCustomer(phone: string, name: string, command: string) {
  const config = whatsappConfig();
  const marketplaceUrl = `${config.siteUrl}/shopping`;
  const dispatchUrl = `${config.siteUrl}/book`;
  const normalizedCommand = command.trim().toUpperCase();
  if (normalizedCommand === "MARKETPLACE" || normalizedCommand === "SHOP" || normalizedCommand === "FOOD") {
    await sendWhatsAppText({ to: phone, body: `Welcome, ${name}. Open your secure FastFleets marketplace here to order: ${marketplaceUrl}` });
    return;
  }
  if (normalizedCommand === "DISPATCH" || normalizedCommand === "DELIVERY") {
    await sendWhatsAppText({ to: phone, body: `Welcome, ${name}. Open your secure FastFleets dispatch form here: ${dispatchUrl}` });
    return;
  }
  await sendWhatsAppText({
    to: phone,
    body: `Welcome, ${name}.\n\nReply MARKETPLACE to order shopping or food, or DISPATCH to book a delivery.\n\nYou can also continue securely here:\nMarketplace: ${marketplaceUrl}\nDispatch: ${dispatchUrl}`
  });
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
  return String(
    message.text?.body || message.button?.payload || message.button?.text || message.interactive?.button_reply?.id || message.interactive?.button_reply?.title || message.interactive?.list_reply?.id || message.interactive?.list_reply?.title || ""
  ).trim();
}

function firstName(value: string | null | undefined) {
  return value?.trim().split(/\s+/)[0] || "there";
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
