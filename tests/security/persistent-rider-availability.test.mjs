import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const availability = read("app/api/rider/availability/route.ts");
const dashboard = read("components/rider/rider-dashboard.tsx");
const notifier = read("lib/rider-delivery-opportunities.ts");
const migration = read("security-remediation/migrations/202609270002_persistent_rider_availability.sql");
const settlement = read("lib/payments/settlement.ts");
const adminRiders = read("app/api/admin/riders/route.ts");
const riderDashboardPage = read("app/rider/dashboard/page.tsx");
const riderJobs = read("app/api/rider/jobs/route.ts");

test("rider availability is an explicit authenticated server-side preference", () => {
  assert.match(availability, /auth\.getUser\(\)/);
  assert.match(availability, /typeof requestedOnline === "boolean"/);
  assert.match(availability, /patch\.online = requestedOnline/);
  assert.doesNotMatch(availability, /hasActiveDelivery/);
  assert.doesNotMatch(dashboard, /restored = await saveRiderAvailability/);
  assert.match(dashboard, /useState\(initialOnline\)/);
  assert.match(dashboard, /typeof riderData\.online === "boolean" \? riderData\.online : initialOnline/);
  assert.match(riderDashboardPage, /initialOnline=\{Boolean\(riderProfileResult\.data\?\.online\)\}/);
  assert.match(riderDashboardPage, /const riderProfileReader = admin \|\| supabase/);
  assert.doesNotMatch(riderDashboardPage, /online:\s*Boolean\(riderProfile\?\.online\)/);
  assert.match(riderDashboardPage, /Omit availability from the repair payload/);
  assert.match(riderJobs, /must not reset a rider who[\s\S]*chosen to remain online/);
  assert.match(adminRiders, /explicit availability unchanged on an upsert/);
  assert.doesNotMatch(adminRiders, /\.update\(\{ online: false \}\)[\s\S]{0,120}\.neq\("application_status", "approved"\)/);
});

test("delivery opportunities use persistent online state and a delivery/rider idempotency gate", () => {
  assert.match(notifier, /\.eq\("online", true\)/);
  assert.match(notifier, /rider_delivery_notifications/);
  assert.match(notifier, /notification_type: "delivery_opportunity"/);
  assert.match(migration, /unique \(delivery_id, rider_profile_id, notification_type\)/);
  assert.match(migration, /enable row level security/);
});

test("payment settlement dispatches notification attempts without changing authoritative acceptance", () => {
  assert.match(settlement, /notifyEligibleRiders/);
  assert.match(settlement, /delivery\?\.status === "searching"/);
  assert.match(notifier, /Promise\.allSettled/);
  assert.doesNotMatch(notifier, /accept_or_queue_delivery_offer/);
});

test("browser notification permission is requested only after the rider elects to go online", () => {
  assert.match(dashboard, /fastfleet:request-push-notifications/);
  const registrar = read("components/notifications/push-notification-registrar.tsx");
  assert.match(registrar, /registerWebPush\(prompt = false\)/);
  assert.match(registrar, /prompt \? await Notification\.requestPermission/);
});
