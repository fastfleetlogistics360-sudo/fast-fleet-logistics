import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const sql = readFileSync("security-remediation/migrations/202610140002_checkout_reservations_and_pickup.sql", "utf8");
const cron = readFileSync("app/api/cron/expire-payment-reservations/route.ts", "utf8");
test("F054 reservation lifecycle remains opt-in and preserves paid acceptance", () => {
  assert.match(sql, /accept_or_queue_paid_delivery_offer/);
  assert.match(sql, /rider_payment_reservation/);
  assert.match(sql, /awaiting_customer_payment/);
  assert.match(sql, /payment_reservation_minutes/);
  assert.match(sql, /status in \('expired','released'\)/);
  assert.match(sql, /revoke all on function public\.accept_or_queue_paid_delivery_offer/);
  assert.match(sql, /accepted\.assignment_status <> 'accepted'/);
});
test("F054 expiry is service-only, payment-aware, and cron-triggered", () => {
  assert.match(sql, /not exists \(select 1 from public\.payment_intents/);
  assert.match(sql, /grant execute on function public\.expire_delivery_payment_reservations\(\) to service_role/);
  assert.match(cron, /authorizeCronRequest/);
  assert.match(cron, /expire_delivery_payment_reservations/);
});
