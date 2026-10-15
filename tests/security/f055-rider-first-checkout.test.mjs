import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const checkout = read("app/api/deliveries/checkout/route.ts");
const startPayment = read("app/api/deliveries/start-payment/route.ts");
const matchStatus = read("app/api/deliveries/match-status/route.ts");
const search = read("components/booking/rider-match-search.tsx");
const settlement = read("lib/payments/settlement.ts");
const migration = read("security-remediation/migrations/202610140003_rider_first_payment_settlement.sql");
const raceSafetyMigration = read("security-remediation/migrations/202610140005_rider_first_settlement_race_safety.sql");

test("F055: rider-first checkout waits for acceptance before creating a Squad intent", () => {
  assert.match(checkout, /rider_payment_reservation: riderFirst/);
  assert.match(checkout, /status: riderFirst \? "searching" : "pending_payment"/);
  assert.match(checkout, /if \(riderFirst\)[\s\S]*return NextResponse\.json/);
  assert.match(startPayment, /\["awaiting_customer_payment", "searching"\]\.includes\(delivery\.status\)/);
  assert.match(startPayment, /reservation\.status !== "reserved"/);
  assert.match(startPayment, /internalReference: `delivery:\$\{delivery\.id\}`/);
});

test("F055: accepted unpaid riders are name-only and have a bounded payment window", () => {
  assert.match(matchStatus, /riderName: awaitingPayment/);
  assert.doesNotMatch(matchStatus, /phone|email|whatsapp/i);
  assert.match(search, /Complete payment to proceed/);
  assert.match(search, /formatCountdown/);
  assert.match(search, /contact stays private until payment/);
  assert.match(search, /paymentRequired \|\| !match\.messengerHref/);
});

test("F055: settlement promotes an active reservation atomically and preserves late payments for review", () => {
  assert.match(migration, /after update of status on public\.payment_intents/);
  assert.match(migration, /status = 'reserved' and reservation\.expires_at > now\(\)/);
  assert.match(migration, /status = 'paid'/);
  assert.match(migration, /status='late_payment_review'/);
  assert.match(migration, /mark_late_rider_payment_for_review/);
  assert.match(migration, /d\.status in \('awaiting_customer_payment', 'searching'\)/);
  assert.match(settlement, /markLateRiderPaymentForReview/);
});

test("F055: settlement compatibility closes the checkout activation and expiry races", () => {
  assert.match(raceSafetyMigration, /settle_squad_payment_intent_base/);
  assert.match(raceSafetyMigration, /awaiting_customer_payment/);
  assert.match(raceSafetyMigration, /for update of d skip locked/);
  assert.match(raceSafetyMigration, /Service role required/);
});
