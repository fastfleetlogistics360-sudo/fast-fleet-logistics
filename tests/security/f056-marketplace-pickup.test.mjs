import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const checkout = read("app/api/marketplace/checkout/route.ts");
const workflow = read("lib/marketplace-order-workflow.ts");
const customerCode = read("app/api/customer/pickup-code/route.ts");
const vendorCode = read("app/api/business/orders/pickup-confirmation/route.ts");
const migration = read("security-remediation/migrations/202610140004_marketplace_pickup_completion.sql");
const restaurant = read("components/marketplace/order-marketplace.tsx");
const shopping = read("components/marketplace/shopping-marketplace.tsx");

test("F056: restaurant and shopping pickup checkout omit delivery economics and riders", () => {
  for (const source of [restaurant, shopping]) {
    assert.match(source, /fulfilmentMethod/);
    assert.match(source, /Pick-up/);
    assert.match(source, /delivery fee/);
  }
  assert.match(checkout, /fulfilmentMethod = payload\.fulfilmentMethod === "PICKUP"/);
  assert.match(checkout, /const deliveryFee = fulfilmentMethod === "PICKUP" \? 0/);
  assert.match(checkout, /operationalDeliveryFee = fulfilmentMethod === "PICKUP" \? 0/);
  assert.match(checkout, /fulfilment_method: fulfilmentMethod/);
  assert.match(workflow, /order\.fulfilment_method !== "PICKUP"/);
});

test("F056: pickup orders are paid-only vendor work and never create a rider delivery", () => {
  assert.match(workflow, /transitionCreatesDelivery\(status, deliveryId\) && order\.fulfilment_method !== "PICKUP"/);
  assert.match(workflow, /Only a verified paid order can enter preparation/);
  assert.match(workflow, /Ready for pickup/);
  assert.match(checkout, /issueMarketplacePickupCode/);
});

test("F056: pickup code is customer-only, retry-limited, vendor-scoped, and atomically single-use", () => {
  assert.match(customerCode, /eq\("customer_id", user\.id\)/);
  assert.match(customerCode, /order\.payment_status !== "paid"/);
  assert.match(vendorCode, /eq\("business_profile_id", profile\.id\)/);
  assert.match(vendorCode, /order\.status !== "ready_for_pickup"/);
  assert.match(vendorCode, /confirmation\.attempts >= confirmation\.max_attempts/);
  assert.match(vendorCode, /complete_marketplace_pickup/);
  assert.match(migration, /for update/);
  assert.match(migration, /fulfilment_method <> 'PICKUP'/);
  assert.match(migration, /status='verified'/);
  assert.match(migration, /status='delivered'/);
});
