import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase-fast-errands-phase2-delta.sql");
const dispatch = read("app/api/business/orders/route.ts");
const wallet = read("lib/wallet-ledger.ts");

test("F-018 preserves raw-metre pricing, inactive-by-default areas, and no inventory schema", () => {
  assert.match(migration, /maximum_distance_meters integer not null/);
  assert.match(migration, /is_active boolean not null default false/);
  assert.match(migration, /FastErrand pricing bands must be contiguous and non-overlapping/);
  assert.doesNotMatch(migration, /stock_quantity|inventory_movement|stock_reservation/);
});

test("F-018 freezes v2 customer pricing and dispatch never reprices it", () => {
  assert.match(dispatch, /parseFastErrandV2Snapshot/);
  assert.match(dispatch, /fastErrandSnapshotDeliveryEstimate/);
  assert.match(dispatch, /Paid v2 FastErrands never consult mutable marketplace fare rules/);
  assert.match(migration, /fast_errand_delivery_payouts/);
});

test("F-018 payout models use the required exact allocations and rider wallet uses the snapshot", () => {
  assert.match(migration, /company_bicycle.*rider_pct:=30.*company_pct:=70/s);
  assert.match(migration, /investor_bicycle.*rider_pct:=30; investor_pct:=60; company_pct:=10/s);
  assert.match(migration, /independent_rider.*rider_pct:=90; investor_pct:=0; company_pct:=10/s);
  assert.match(migration, /rider_payout_ngn \+ investor_payout_ngn \+ company_share_ngn = eligible_revenue_ngn/);
  assert.match(wallet, /settleFastErrandInvestorPayout/);
});
