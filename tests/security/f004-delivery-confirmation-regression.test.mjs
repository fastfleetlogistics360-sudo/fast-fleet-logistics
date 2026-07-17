import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("F-004 riders can request confirmation but cannot mark an in-transit delivery delivered", () => {
  const route = read("app/api/rider/jobs/route.ts");
  assert.match(route, /in_transit:\s*"awaiting_delivery_confirmation"/);
  assert.doesNotMatch(route, /in_transit:\s*"delivered"/);
  assert.match(route, /if \(!nextStatus\)/);
  assert.doesNotMatch(route, /statusFlow\[String\(current\.status\)\]\s*\|\|\s*"delivered"/);
});

test("F-004 delivery PINs are protected, short lived, and never included in push metadata", () => {
  const confirmation = read("lib/delivery-confirmation.ts");
  assert.match(confirmation, /randomInt\(0, 1_000_000\)/);
  assert.match(confirmation, /createHmac\("sha256"/);
  assert.match(confirmation, /createCipheriv\("aes-256-gcm"/);
  assert.match(confirmation, /timingSafeEqual/);
  assert.match(confirmation, /DELIVERY_CONFIRMATION_TTL_MS = 15 \* 60 \* 1000/);
  assert.match(confirmation, /DELIVERY_CONFIRMATION_MAX_ATTEMPTS = 5/);

  const metadataBlock = confirmation.match(/metadata:\s*\{[\s\S]*?\}\n\s*\}\)\n\s*\);/)?.[0] || "";
  assert.doesNotMatch(metadataBlock, /\bcode\b|\bpin\b/i);
});

test("F-004 verification requires the assigned rider, exact waiting status, expiry, and attempt checks", () => {
  const route = read("app/api/rider/delivery-confirmation/route.ts");
  assert.match(route, /delivery\.rider_id !== rider\.id/);
  assert.match(route, /delivery\.status !== "awaiting_delivery_confirmation"/);
  assert.match(route, /deliveryConfirmationExpired\(confirmation\)/);
  assert.match(route, /confirmation\.attempts >= confirmation\.max_attempts/);
  assert.match(route, /verifyDeliveryPin\(code, confirmation\)/);
  assert.match(route, /finalizeConfirmedDelivery\(db, delivery, user\.id, "delivery_pin"\)/);
});

test("F-004 customers can confirm only deliveries they own", () => {
  const route = read("app/api/customer/delivery-confirmation/route.ts");
  const confirmation = read("lib/delivery-confirmation.ts");
  assert.match(route, /userCanConfirmDelivery\(delivery as DeliveryConfirmationTarget, user\.id\)/);
  assert.match(route, /finalizeConfirmedDelivery\(db, delivery, userId, "customer_app"\)/);
  assert.match(route, /Cache-Control", "no-store, private, max-age=0"/);
  assert.match(confirmation, /marketplaceCustomerId \? \[marketplaceCustomerId\] : \[delivery\.customer_id\]/);
});

test("F-004 completion is conditional and settlement remains idempotent", () => {
  const completion = read("lib/delivery-completion.ts");
  const customerRoute = read("app/api/customer/delivery-confirmation/route.ts");
  const riderRoute = read("app/api/rider/delivery-confirmation/route.ts");
  const wallet = read("lib/wallet-ledger.ts");
  const riderCredit = wallet.slice(wallet.indexOf("export async function creditRiderDeliveryWallet"));
  assert.match(completion, /\.eq\("status", "awaiting_delivery_confirmation"\)/);
  assert.match(completion, /creditRiderDeliveryWallet\(db, delivery\.id\)/);
  assert.match(customerRoute, /delivery\.status === "delivered"[\s\S]*creditRiderDeliveryWallet/);
  assert.match(riderRoute, /delivery\.status === "delivered"[\s\S]*creditRiderDeliveryWallet/);
  assert.match(wallet, /transactions_provider_reference|providerReference/);
  assert.match(riderCredit, /transactionError[\s\S]*23505[\s\S]*credited: false/);
});

test("F-004 production delta is narrow and removes direct participant status updates", () => {
  const migration = read("supabase-delivery-confirmation-delta.sql");
  assert.match(migration, /create table if not exists public\.delivery_confirmations/);
  assert.match(migration, /create policy "Admins update deliveries"/);
  assert.match(migration, /create policy "Admins update orders"/);
  assert.match(migration, /med \/ pharmacy/);
  assert.doesNotMatch(migration, /drop column|drop table|truncate|delete from/i);
});
