import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
const scheduler = readFileSync(
  "security-remediation/migrations/202610150001_supabase_reservation_expiry_cron.sql",
  "utf8",
);
const expiry = readFileSync(
  "security-remediation/migrations/202610140005_rider_first_settlement_race_safety.sql",
  "utf8",
);

test("F057 moves only reservation expiry scheduling off Vercel", () => {
  assert.ok(!vercel.crons.some((job) => job.path === "/api/cron/expire-payment-reservations"));
  assert.ok(vercel.crons.some((job) => job.path === "/api/wallet/daily-commission"));
  assert.ok(vercel.crons.some((job) => job.path === "/api/payments/reconcile"));
  assert.ok(vercel.crons.some((job) => job.path === "/api/cron/care360"));
});

test("F057 schedules an owner-only, idempotent Supabase Cron invocation", () => {
  assert.match(scheduler, /create extension if not exists pg_cron/);
  assert.match(scheduler, /run_delivery_payment_reservation_expiry_cron\(\)/);
  assert.match(scheduler, /session_user not in \('postgres', 'supabase_admin'\)/);
  assert.match(scheduler, /set_config\('request\.jwt\.claim\.role', 'service_role', true\)/);
  assert.match(scheduler, /revoke all on function public\.run_delivery_payment_reservation_expiry_cron\(\)/);
  assert.match(scheduler, /cron\.unschedule\(jobid\)/);
  assert.match(scheduler, /fastfleet-expire-delivery-payment-reservations/);
  assert.match(scheduler, /'\* \* \* \* \*'/);
  assert.match(scheduler, /select public\.run_delivery_payment_reservation_expiry_cron\(\)/);
});

test("F057 preserves the protected payment-aware expiry implementation", () => {
  assert.match(expiry, /create or replace function public\.expire_delivery_payment_reservations\(\)/);
  assert.match(expiry, /returns integer/);
  assert.match(expiry, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(expiry, /for update of d skip locked/);
  assert.match(expiry, /pi\.status = 'settled'/);
});
