import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const migration = read("security-remediation/migrations/202610150002_repair_marketplace_pickup_schema.sql");
const matchSearch = read("components/booking/rider-match-search.tsx");

test("F058: pickup repair migration is forward-only and service-role protected", () => {
  assert.match(migration, /add column if not exists fulfilment_method/);
  assert.match(migration, /create table if not exists public\.marketplace_pickup_confirmations/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /Service role required/);
  assert.match(migration, /revoke all on function public\.complete_marketplace_pickup/);
  assert.match(migration, /grant execute on function public\.complete_marketplace_pickup[\s\S]*to service_role/);
});

test("F058: an accepted rider automatically starts protected Squad checkout", () => {
  assert.match(matchSearch, /paymentLaunchStarted/);
  assert.match(matchSearch, /paymentRequired \|\| reservationExpired \|\| paymentLaunchStarted\.current/);
  assert.match(matchSearch, /void beginPayment\(\)/);
  assert.match(matchSearch, /paymentLaunchStarted\.current = false/);
});
