import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const riderStatus = read("lib/operations/rider-status.ts");
const riderApi = read("app/api/operations/riders/route.ts");
const teamApi = read("app/api/operations/team/route.ts");
const riderUi = read("components/operations/rider-fleet-operations.tsx");
const phaseOne = read("security-remediation/migrations/202609280002_marketplace_vendor_foundation.sql");
const migration = read("security-remediation/migrations/202609280004_operations_control_center_indexes.sql");

test("Phase 3 keeps online preference separate from availability, busy work, and GPS freshness", () => {
  assert.match(riderStatus, /offline: !input\.online/);
  assert.match(riderStatus, /busy = input\.online && input\.hasBlockingDelivery/);
  assert.match(riderStatus, /available = input\.online && input\.approved && !input\.hasBlockingDelivery/);
  assert.match(riderStatus, /location: input\.locationUpdatedAt \? \(locationFresh \? "fresh" : "stale"\) : "unavailable"/);
  assert.doesNotMatch(riderStatus, /online\s*=/);
  assert.match(riderApi, /BLOCKING_RIDER_DELIVERY_STATUSES/);
  assert.match(riderApi, /location_freshness_minutes/);
  assert.doesNotMatch(riderApi, /\.update\(\{[^}]*online/);
});

test("Rider and fleet operations are admin-only, bounded, private, and coalesced realtime", () => {
  assert.match(riderApi, /requireAdminSession\(\)/);
  assert.match(riderApi, /\.range\(page \* pageSize/);
  assert.match(riderApi, /\.limit\(pageSize \* 2\)/);
  assert.match(riderApi, /operations_rider_summary/);
  assert.match(riderApi, /investor_asset_assignments/);
  assert.match(riderApi, /\.is\("ended_at", null\)/);
  assert.match(riderUi, /table: "rider_profiles"/);
  assert.match(riderUi, /table: "rider_locations"/);
  assert.match(riderUi, /table: "deliveries"/);
  assert.match(riderUi, /table: "fleet_assets"/);
  assert.match(riderUi, /setTimeout\(\(\) => void load\(true\), 500\)/);
  assert.match(riderUi, /removeChannel/);
});

test("Only canonical admins can change operator scopes, and every change is audited", () => {
  assert.match(teamApi, /requireAdminSession\(request\)/);
  assert.match(teamApi, /enforceAdminMutationRateLimit/);
  assert.match(teamApi, /role !== "operator" && role !== "manager"/);
  assert.match(teamApi, /operational_mode", "fastfleet_managed"/);
  assert.match(teamApi, /managed_by_fastfleet", true/);
  assert.match(teamApi, /marketplace_audit_events/);
  assert.match(teamApi, /actor_type: "admin"/);
  assert.match(teamApi, /revoked_at: new Date\(\)\.toISOString\(\)/);
  assert.match(phaseOne, /alter table public\.marketplace_operator_memberships enable row level security/);
  assert.match(phaseOne, /alter table public\.marketplace_audit_events enable row level security/);
  assert.doesNotMatch(phaseOne, /create policy[\s\S]*(marketplace_audit_events|marketplace_operator_memberships)/i);
});

test("Phase 3 indexes support canonical read models without creating rider presence", () => {
  assert.match(migration, /rider_profiles_operations_online_updated_idx/);
  assert.match(migration, /deliveries_operations_rider_active_idx/);
  assert.match(migration, /investor_asset_assignments_operations_active_asset_idx/);
  assert.match(migration, /operations_rider_summary/);
  assert.doesNotMatch(migration, /rider_presence/i);
});
