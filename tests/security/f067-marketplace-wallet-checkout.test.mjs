import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkout = readFileSync("app/api/marketplace/checkout/route.ts", "utf8");
const migration = readFileSync("security-remediation/migrations/202610190002_marketplace_wallet_checkout.sql", "utf8");
const restaurant = readFileSync("components/marketplace/order-marketplace.tsx", "utf8");
const shopping = readFileSync("components/marketplace/shopping-marketplace.tsx", "utf8");

test("F067: Restaurant and Shopping checkouts offer a server-authorized wallet method", () => {
  for (const source of [restaurant, shopping]) {
    assert.match(source, /setPaymentMethod\("wallet"\)/);
    assert.match(source, /paymentMethod/);
  }
  assert.match(checkout, /payload\.paymentMethod === "wallet"/);
  assert.match(checkout, /pay_marketplace_order_from_wallet/);
  assert.match(checkout, /paymentMethod === "wallet"/);
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
