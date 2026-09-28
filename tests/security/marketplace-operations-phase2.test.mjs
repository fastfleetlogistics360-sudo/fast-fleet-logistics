import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const operations = read("app/api/marketplace/operations/route.ts");
const action = read("app/api/marketplace/operations/orders/[orderId]/route.ts");
const workflow = read("lib/marketplace-order-workflow.ts");
const operatorAuth = read("lib/marketplace-operator-auth.ts");
const businessRoute = read("app/api/business/orders/route.ts");
const phaseOneMigration = read("security-remediation/migrations/202609280002_marketplace_vendor_foundation.sql");

test("Phase 2 operator reads are authenticated, membership scoped, and limited to managed vendors", () => {
  assert.match(operations, /auth\.getUser\(\)/);
  assert.match(operations, /activeMarketplaceOperatorMemberships/);
  assert.match(operations, /operational_mode", "fastfleet_managed"/);
  assert.match(operations, /managed_by_fastfleet", true/);
  assert.match(operations, /allowedVendorIds\.includes\(vendorId\)/);
  assert.match(operations, /range\(page \* pageSize/);
  assert.doesNotMatch(operations, /\.select\("\*"\)/);
});

test("Arena and Royal stay isolated by marketplace vendor ID even when their business account is shared", () => {
  assert.match(operations, /\.eq\("marketplace_vendor_id", vendor\.id\)/);
  assert.match(operations, /\.in\("marketplace_vendor_id", vendorId \? \[vendorId\] : allowedVendorIds\)/);
  assert.doesNotMatch(operations, /\.eq\("business_profile_id", vendorId\)/);
  assert.match(action, /order\.marketplace_vendor_id/);
  assert.match(action, /hasActiveMarketplaceOperatorScope\(db, user\.id, order\.marketplace_vendor_id\)/);
});

test("operator transition cannot be authorized by a body or URL vendor ID", () => {
  assert.match(action, /params: Promise<\{ orderId: string \}>/);
  assert.match(action, /\.eq\("id", orderId\)/);
  assert.match(action, /typeof order\.marketplace_vendor_id !== "string"/);
  assert.doesNotMatch(action, /payload\.vendorId/);
  assert.match(operatorAuth, /\.eq\("active", true\)/);
  assert.match(operatorAuth, /\.is\("revoked_at", null\)/);
});

test("only the shared canonical workflow creates a delivery and sends rider opportunities", () => {
  assert.match(workflow, /transitionCreatesDelivery/);
  assert.match(workflow, /\.from\("deliveries"\)\s*\.insert/);
  assert.match(workflow, /notifyEligibleRiders/);
  assert.match(businessRoute, /transitionMarketplaceOrder/);
  assert.match(action, /transitionMarketplaceOrder/);
  assert.doesNotMatch(action, /\.from\("deliveries"\)\s*\.insert/);
  assert.match(read("security-remediation/migrations/202609280003_marketplace_operations_delivery_idempotency.sql"), /unique index.*deliveries_marketplace_order_unique_idx/is);
});

test("payment, ordered preparation, audit attribution, and browser-write protection remain enforced", () => {
  assert.match(workflow, /payment_status.*paid/);
  assert.match(workflow, /\["pending", "received", "preparing", "packing", "ready_for_pickup"\]/);
  assert.match(workflow, /\.from\("marketplace_audit_events"\)\.insert/);
  assert.match(workflow, /actor_type: "operator"/);
  assert.match(phaseOneMigration, /alter table public\.marketplace_audit_events enable row level security/);
  assert.match(phaseOneMigration, /alter table public\.marketplace_operator_memberships enable row level security/);
  assert.doesNotMatch(phaseOneMigration, /create policy[\s\S]*(marketplace_audit_events|marketplace_operator_memberships)/i);
});
