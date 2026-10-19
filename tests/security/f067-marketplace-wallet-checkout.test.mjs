import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync("app/api/marketplace/checkout/route.ts", "utf8");
const migration = readFileSync("security-remediation/migrations/202610190002_marketplace_wallet_checkout.sql", "utf8");
const restaurant = readFileSync("components/marketplace/order-marketplace.tsx", "utf8");
const shopping = readFileSync("components/marketplace/shopping-marketplace.tsx", "utf8");
const authorization = readFileSync("lib/payment-authorization.ts", "utf8");
const deliveryAuthorization = readFileSync("security-remediation/migrations/202610190003_marketplace_wallet_delivery_authorization.sql", "utf8");

test("F067: Restaurant and Shopping checkouts offer a server-authorized wallet method", () => {
  for (const source of [restaurant, shopping]) {
    assert.match(source, /setPaymentMethod\("wallet"\)/);
    assert.match(source, /paymentMethod/);
  }
  assert.match(checkout, /payload\.paymentMethod === "wallet"/);
  assert.match(checkout, /pay_marketplace_order_from_wallet/);
  assert.match(checkout, /paymentMethod === "wallet"/);
});

test("F067: a successful Wallet Marketplace payment unlocks its later-created rider delivery", () => {
  assert.match(authorization, /payment_method === "wallet" && order\.payment_status === "paid"/);
  assert.match(authorization, /settledWalletReferences/);
  assert.match(deliveryAuthorization, /o\.marketplace_kind in \('restaurant','shopping'\)/);
  assert.match(deliveryAuthorization, /t\.provider='fastfleet_wallet'/);
  assert.match(deliveryAuthorization, /t\.metadata @> jsonb_build_object\('marketplace_order_id',o\.id\)/);
});

test("F067: Marketplace wallet debits are atomic, customer-owned, and isolated to Restaurant/Shopping", () => {
  assert.match(migration, /for update/);
  assert.match(migration, /target_order\.customer_id <> auth\.uid\(\)/);
  assert.match(migration, /target_order\.marketplace_kind not in \('restaurant','shopping'\)/);
  assert.match(migration, /Insufficient wallet balance/);
  assert.match(migration, /balance_ngn=balance_ngn-target_order\.amount/);
  assert.match(migration, /payment_status='paid',status='received'/);
  assert.match(migration, /status='searching'/);
});
