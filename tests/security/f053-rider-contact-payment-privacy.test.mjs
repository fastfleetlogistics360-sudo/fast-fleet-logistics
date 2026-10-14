import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("security-remediation/migrations/202610140001_rider_contact_payment_privacy.sql");
const tracking = read("app/api/tracking/route.ts");
const liveState = read("app/api/account/delivery-live-state/route.ts");
const riderJobs = read("app/api/rider/jobs/route.ts");
const trackingRoom = read("components/tracking/live-order-tracking.tsx");
const customerDashboard = read("components/dashboard/customer-dashboard.tsx");

test("F053: Rider contact authorization is tied to an independently settled payment record", () => {
  assert.match(migration, /create or replace function public\.delivery_payment_is_verified/);
  assert.match(migration, /payment_intents pi[\s\S]*pi\.status = 'settled'/);
  assert.match(migration, /transactions t[\s\S]*transaction_type = 'delivery_payment'[\s\S]*status = 'successful'/);
  assert.match(migration, /revoke all on function public\.delivery_payment_is_verified/);
  assert.doesNotMatch(migration, /d\.status in \('accepted'/);
});

test("F053: browser Supabase profile policies cannot reveal an unpaid assigned rider", () => {
  assert.match(migration, /Customers read assigned rider user profile/);
  assert.match(migration, /Customers read assigned rider profile/);
  assert.match(migration, /public\.delivery_payment_is_verified\(d\.id\)/);
});

test("F053: public tracking never returns rider contact and owner APIs redact it until payment is verified", () => {
  assert.match(tracking, /phone: null/);
  assert.match(tracking, /email: null/);
  assert.match(tracking, /full_name: null/);
  assert.match(liveState, /paymentVerified \? delivery\.rider_profiles\?\.users\?\.phone/);
  assert.match(liveState, /contact_unlocked: paymentVerified/);
  assert.match(read("app/api/customer/dashboard/route.ts"), /phone: unlocked \? users\.phone : null/);
});

test("F053: unpaid rider actions are server-blocked and customer contact controls stay hidden", () => {
  assert.match(riderJobs, /await deliveryPaymentIsVerified\(db, current\)/);
  assert.match(riderJobs, /Awaiting customer payment/);
  assert.match(trackingRoom, /contact_unlocked && order\.rider\.phone/);
  assert.match(trackingRoom, /Complete payment to proceed/);
  assert.doesNotMatch(trackingRoom, /from\("rider_profiles"/);
  assert.match(customerDashboard, /order\.contact_unlocked && order\.rider_profiles\?\.users\?\.phone/);
});
