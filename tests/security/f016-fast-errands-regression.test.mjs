import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const checkout = read("app/api/fast-errands/checkout/route.ts");
const adminQueue = read("app/api/admin/fast-errands/route.ts");
const settlement = read("lib/payments/settlement.ts");
const completion = read("lib/delivery-completion.ts");
const migration = read("supabase-fasterrands-delta.sql");
const catalogueMigration = read("supabase-fast-errands-catalog-delta.sql");

test("F-016 uses an admin-selected active fulfilment business and server-owned catalogue prices", () => {
  assert.match(checkout, /loadFastErrandsFulfilmentBusinessId/);
  assert.match(checkout, /loadActiveLinkedBusiness/);
  assert.match(checkout, /fast_errand_catalog_items/);
  assert.match(checkout, /price_ngn/);
  assert.match(checkout, /business\.operating_state/);
  assert.match(checkout, /businessStates\.includes\(dropoffState\)/);
  assert.match(checkout, /purpose: "marketplace_business_order"/);
  assert.doesNotMatch(checkout, /purchaseBudgetNgn/);
});

test("F-016 lets admins manage one fulfilment account plus categories and priced items", () => {
  assert.match(adminQueue, /set-fulfilment-business/);
  assert.match(adminQueue, /fastErrandsFulfilmentBusinessSettingsKey/);
  assert.match(adminQueue, /save-category/);
  assert.match(adminQueue, /save-item/);
});

test("F-016 preserves protected legacy FastErrands records through delivery completion", () => {
  assert.match(settlement, /metadata\.fast_errand_top_up !== true/);
  assert.match(settlement, /FastErrands top-up protected/);
  assert.match(completion, /fast_errand_orders/);
  assert.match(completion, /event_type: "delivered"/);
});

test("F-016 migrations have auditable legacy errands and an admin-managed catalogue", () => {
  assert.match(migration, /create table if not exists public\.fast_errand_orders/);
  assert.match(migration, /vendor_transfer_reference text/);
  assert.match(migration, /top_up_required_ngn numeric/);
  assert.match(migration, /fast_errand_events/);
  assert.match(migration, /Customers and admins read own fast errands/);
  assert.match(catalogueMigration, /create table if not exists public\.fast_errand_categories/);
  assert.match(catalogueMigration, /create table if not exists public\.fast_errand_catalog_items/);
  assert.match(catalogueMigration, /Public reads active FastErrands catalogue items/);
});
