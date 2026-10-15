import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const checkout = read("app/api/marketplace/checkout/route.ts");
const startPayment = read("app/api/deliveries/start-payment/route.ts");
const settlement = read("lib/payments/settlement.ts");
const restaurant = read("components/marketplace/order-marketplace.tsx");
const shopping = read("components/marketplace/shopping-marketplace.tsx");

test("F058: pickup bypasses delivery routing and keeps the verified vendor address", () => {
  assert.match(checkout, /fulfilmentMethod === "PICKUP"\s*\? \{/);
  assert.match(checkout, /routeSource: "pickup"/);
  assert.match(checkout, /fulfilmentMethod === "PICKUP"\s*\? Promise\.resolve\(null\)/);
  assert.match(checkout, /deliveryFee: 0/);
  assert.match(checkout, /quotePickupAddress/);
});

test("F058: marketplace delivery searches before a chargeable checkout is created", () => {
  assert.match(checkout, /rider_payment_reservation: true/);
  assert.match(checkout, /status: "searching"/);
  assert.match(checkout, /notifyEligibleRiders/);
  assert.match(checkout, /riderFirst: true/);
  assert.match(startPayment, /source === "fastfleet_marketplace"/);
  assert.match(startPayment, /purpose: paymentPurpose/);
  for (const source of [restaurant, shopping]) {
    assert.match(source, /payload\.riderFirst/);
    assert.match(source, /\/delivery\/match\?/);
  }
});

test("F058: paid marketplace deliveries make a linked vendor order actionable only after settlement", () => {
  assert.match(settlement, /confirmMarketplaceDeliveryOrderAfterPayment/);
  assert.match(settlement, /\.eq\("payment_status", "pending"\)/);
  assert.match(settlement, /payment_status: "paid"/);
});
