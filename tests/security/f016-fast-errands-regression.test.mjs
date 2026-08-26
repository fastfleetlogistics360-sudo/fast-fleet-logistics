import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const checkout = read("app/api/fast-errands/checkout/route.ts");
const adminQueue = read("app/api/admin/fast-errands/route.ts");
const riderJobs = read("app/api/rider/jobs/route.ts");
const settlement = read("lib/payments/settlement.ts");
const completion = read("lib/delivery-completion.ts");
const migration = read("supabase-fasterrands-delta.sql");

test("F-016 keeps FastErrands limited to admin-selected active businesses and their operating states", () => {
  assert.match(checkout, /loadFastErrandsVendorIds/);
  assert.match(checkout, /loadActiveLinkedBusiness/);
  assert.match(checkout, /allowedBusinessIds\.includes\(business\.id\)/);
  assert.match(checkout, /business\.operating_state/);
  assert.match(checkout, /vendorStates\.includes\(dropoffState\)/);
  assert.match(checkout, /purpose: "delivery_payment"/);
});

test("F-016 never releases a FastErrand rider before manual vendor funding", () => {
  assert.match(riderJobs, /source !== "fast_errands" \|\| metadata\?\.vendor_funding_status === "funded"/);
  assert.match(adminQueue, /Squad transfer reference/);
  assert.match(adminQueue, /provider: "manual_squad_fast_errand_transfer"/);
  assert.match(adminQueue, /vendor_funding_status: "funded"/);
});

test("F-016 protects top-ups, returns unused budgets, and closes the errand after delivery", () => {
  assert.match(settlement, /metadata\.fast_errand_top_up !== true/);
  assert.match(settlement, /FastErrands top-up protected/);
  assert.match(adminQueue, /Unused FastErrands budget refund/);
  assert.match(completion, /fast_errand_orders/);
  assert.match(completion, /event_type: "delivered"/);
});

test("F-016 migration has auditable errand records and customer/admin read access", () => {
  assert.match(migration, /create table if not exists public\.fast_errand_orders/);
  assert.match(migration, /vendor_transfer_reference text/);
  assert.match(migration, /top_up_required_ngn numeric/);
  assert.match(migration, /fast_errand_events/);
  assert.match(migration, /Customers and admins read own fast errands/);
});
