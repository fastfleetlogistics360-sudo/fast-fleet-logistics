import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync("app/api/deliveries/cancel/route.ts", "utf8");
const dashboard = readFileSync("components/dashboard/customer-dashboard.tsx", "utf8");

test("F061 customers can only cancel an unmatched, unpaid rider-first search", () => {
  assert.match(route, /\.eq\("customer_id", user\.id\)/);
  assert.match(route, /\.eq\("status", "searching"\)/);
  assert.match(route, /\.is\("rider_id", null\)/);
  assert.match(route, /\.contains\("metadata", \{ rider_payment_reservation: true \}\)/);
  assert.match(route, /status: "cancelled"/);
});

test("F061 dashboard exposes cancellation only while no rider is assigned", () => {
  assert.match(dashboard, /canCancelPendingRiderSearch/);
  assert.match(dashboard, /Cancel delivery/);
  assert.match(dashboard, /No payment has been collected/);
});
