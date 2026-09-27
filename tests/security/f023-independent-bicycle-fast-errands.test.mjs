import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("F023: an explicitly enabled independent bicycle uses the delivery-fee-only 90/10 model", async () => {
  const [migration, availability, jobs, admin, adminUi] = await Promise.all([
    read("supabase-independent-bicycle-fast-errands-delta.sql"), read("lib/customer-vehicle-options.ts"), read("app/api/rider/jobs/route.ts"), read("app/api/admin/riders/route.ts"), read("components/admin/admin-panel.tsx")
  ]);
  assert.match(migration, /independent_bicycle_enabled boolean not null default false/);
  assert.match(migration, /not independent_bicycle_enabled or rider_account_type = 'independent'/);
  assert.match(migration, /independent_bicycle := bicycle_delivery and target_rider\.rider_account_type = 'independent'/);
  assert.match(migration, /model := 'independent_rider'; rider_pct:=90; investor_pct:=0; company_pct:=10/);
  assert.match(migration, /gross := round\(coalesce\(nullif\(d\.metadata->>'delivery_fee_ngn'/);
  assert.match(availability, /independentBicycleRiders/);
  assert.match(jobs, /independentBicycleEnabled/);
  assert.match(admin, /independent_bicycle_enabled/);
  assert.match(adminUi, /Enable independent bicycle/);
  assert.match(adminUi, /rider keeps 90% of delivery fee/);
});
