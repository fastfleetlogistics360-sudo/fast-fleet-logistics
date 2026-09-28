import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("security-remediation/migrations/202609280002_marketplace_vendor_foundation.sql");
const resolver = read("lib/marketplace-vendors.ts");
const checkout = read("app/api/marketplace/checkout/route.ts");
const operatorAuth = read("lib/marketplace-operator-auth.ts");

test("Phase 1 creates additive vendor, branch, membership, history and audit foundations", () => {
  for (const table of ["marketplace_vendors", "marketplace_vendor_branches", "marketplace_operator_memberships", "marketplace_vendor_management_history", "marketplace_audit_events"]) assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
  assert.match(migration, /add column if not exists marketplace_vendor_id/);
  assert.match(migration, /add column if not exists marketplace_vendor_branch_id/);
  assert.match(migration, /add column if not exists marketplace_vendor_snapshot/);
  assert.match(migration, /unique \(source_kind, legacy_menu_id\)/);
  assert.match(migration, /unique \(marketplace_vendor_id, legacy_branch_key\)/);
  assert.match(migration, /alter table public\.marketplace_operator_memberships enable row level security/);
});

test("backfill is menu-ID based, rerun-safe, and does not treat a business link as ownership", () => {
  assert.match(migration, /restaurant_menu/);
  assert.match(migration, /shopping_malls/);
  assert.match(migration, /fastfleet-kitchen-partners/);
  assert.match(migration, /market-square-ikeja/);
  assert.match(migration, /on conflict \(source_kind, legacy_menu_id\) do update/);
  assert.match(migration, /linked_business_profile_id/);
  assert.doesNotMatch(migration, /claimed_business_profile_id\)\s*select[\s\S]*businessId/);
});

test("checkout resolves one durable public vendor rather than grouping by a shared business profile", () => {
  assert.match(resolver, /menuIds\.length !== 1/);
  assert.match(resolver, /legacy_menu_id/);
  assert.match(checkout, /resolveMarketplaceVendorForCheckout/);
  assert.match(checkout, /marketplace_vendor_id: vendorResolution\.vendor\.id/);
  assert.match(checkout, /marketplace_vendor_branch_id: vendorResolution\.branch\.id/);
  assert.match(checkout, /marketplace_vendor_snapshot: vendorResolution\.snapshot/);
  assert.match(checkout, /Managed vendors may intentionally have no Business Account/);
  assert.match(checkout, /marketplace_vendor_id: vendorResolution\.vendor\.id/);
});

test("future operator access is membership and vendor-scope checked server-side", () => {
  assert.match(operatorAuth, /marketplace_operator_memberships/);
  assert.match(operatorAuth, /\.eq\("active", true\)/);
  assert.match(operatorAuth, /all_vendors\.eq\.true/);
});
