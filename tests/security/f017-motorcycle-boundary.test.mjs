import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const migration = read("security-remediation/migrations/202609050005_motorcycle_interstate_dispatch.sql");
const eligibility = read("lib/rider-eligibility.ts");
const riderJobs = read("app/api/rider/jobs/route.ts");

test("F-017 keeps ordinary motorcycle dispatch state-bound and makes interstate acceptance explicit", () => {
  assert.match(migration, /begin;/);
  assert.match(migration, /interstate_dispatch boolean/);
  assert.match(migration, /Interstate motorcycle jobs must start in your registered rider state/);
  assert.match(migration, /cross_border_pickup_radius_km/);
  assert.match(migration, /bicycle_delivery/);
  assert.match(eligibility, /if \(isInterstateDispatch\(job\)\) return false/);
  assert.match(riderJobs, /Interstate motorcycle jobs must start in your registered pickup state/);
});
