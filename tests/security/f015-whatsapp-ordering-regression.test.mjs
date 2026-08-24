import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const webhook = read("app/api/whatsapp/webhook/route.ts");
const security = read("lib/whatsapp/security.ts");
const ordering = read("lib/whatsapp/ordering.ts");
const email = read("lib/whatsapp/account-confirmation-email.ts");
const migration = read("supabase-whatsapp-ordering-delta.sql");

test("F-015 replaces WhatsApp magic links with expiring, hashed email codes", () => {
  assert.match(webhook, /state: "awaiting_email_code"/);
  assert.match(webhook, /newWhatsAppEmailCode/);
  assert.match(webhook, /whatsappEmailCodeDigest/);
  assert.match(webhook, /verifyWhatsAppEmailCode/);
  assert.match(webhook, /max_attempts: 5/);
  assert.match(webhook, /send_count: 1/);
  assert.match(webhook, /60_000/);
  assert.match(security, /createHmac\("sha256", whatsappEmailConfirmationKey\(\)\)/);
  assert.match(security, /timingSafeEqual/);
  assert.match(migration, /code_digest text/);
  assert.match(migration, /locked_at timestamptz/);
});

test("F-015 redacts confirmation codes from retained inbound WhatsApp content", () => {
  assert.match(webhook, /\[WhatsApp account confirmation code redacted\]/);
  assert.match(webhook, /payload: codeReply \? redactedMessage\(message\) : message/);
  assert.match(webhook, /body: "\[redacted\]"/);
});

test("F-015 uses a branded WhatsApp-account-confirmation email rather than a sign-in link", () => {
  assert.match(email, /subject: "Confirm your WhatsApp account"/);
  assert.match(email, /WHATSAPP ACCOUNT CONFIRMATION/);
  assert.match(email, /YOUR CONFIRMATION CODE/);
  assert.match(email, /RESEND_API_KEY/);
  assert.doesNotMatch(email, /signInWithOtp/);
});

test("F-015 keeps WhatsApp marketplace and dispatch orders in shared app records", () => {
  assert.match(ordering, /state === "marketplace_review"/);
  assert.match(ordering, /state === "dispatch_review"/);
  assert.match(ordering, /from\("orders"\)\.insert/);
  assert.match(ordering, /from\("deliveries"\)\.insert/);
  assert.match(ordering, /createPaymentIntent/);
  assert.match(ordering, /source: "whatsapp_ordering"/);
  assert.match(ordering, /PAY TRANSFER/);
});
