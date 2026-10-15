import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardApi = readFileSync("app/api/customer/dashboard/route.ts", "utf8");
const dashboard = readFileSync("components/dashboard/customer-dashboard.tsx", "utf8");
const resumePayment = readFileSync("app/api/marketplace/start-payment/route.ts", "utf8");

test("F065: customer order data preserves pickup payment and fulfilment state", () => {
  assert.match(dashboardApi, /fulfilment_method, payment_status/);
  assert.match(dashboard, /fulfilment_method\?: string \| null/);
  assert.match(dashboard, /payment_status\?: string \| null/);
  assert.match(dashboard, /Payment pending — the vendor cannot prepare this order until Squad verifies payment/);
  assert.match(dashboard, /const active = paid && index >= 0 && stepIndex <= index/);
});

test("F065: Pickup payment resumes only the customer's original, unsettled intent", () => {
  assert.match(dashboard, /\/api\/marketplace\/start-payment/);
  assert.match(dashboard, /const canResumePickupPayment = businessOrder/);
  assert.match(resumePayment, /\.eq\("customer_id", user\.id\)/);
  assert.match(resumePayment, /order\.fulfilment_method !== "PICKUP"/);
  assert.match(resumePayment, /\.eq\("order_id", order\.id\)/);
  assert.match(resumePayment, /intent\.provider_transaction_reference/);
  assert.doesNotMatch(resumePayment, /createPaymentIntent/);
});
