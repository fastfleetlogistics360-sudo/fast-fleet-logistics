import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const startPayment = readFileSync("app/api/deliveries/start-payment/route.ts", "utf8");
const customerDashboard = readFileSync("components/dashboard/customer-dashboard.tsx", "utf8");

test("F063: an active rider reservation can resume the same Squad payment intent", () => {
  assert.match(startPayment, /const reference = existingIntent\?\.provider_transaction_reference \|\| generatePaymentReference\("FFD"\)/);
  assert.match(startPayment, /const createdPaymentIntent = !existingIntent/);
  assert.match(startPayment, /reservation\.status !== "reserved"/);
  assert.match(startPayment, /new Date\(reservation\.expires_at\)\.getTime\(\) <= Date\.now\(\)/);
});

test("F063: customers can reopen payment only for an assigned, unpaid rider-first reservation", () => {
  assert.match(customerDashboard, /const canResumeRiderPayment = !businessOrder/);
  assert.match(customerDashboard, /Boolean\(order\.rider_id\)/);
  assert.match(customerDashboard, /rider_payment_reservation === true/);
  assert.match(customerDashboard, /\/api\/deliveries\/start-payment/);
  assert.match(customerDashboard, /Complete payment/);
});
