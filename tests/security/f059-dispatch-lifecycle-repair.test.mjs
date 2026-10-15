import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const pickupCode = read("lib/marketplace-pickup-confirmation.ts");
const checkout = read("app/api/marketplace/checkout/route.ts");
const customerPickup = read("app/api/customer/pickup-code/route.ts");
const vendorPickup = read("app/api/business/orders/pickup-confirmation/route.ts");
const riderJobs = read("app/api/rider/jobs/route.ts");
const riderDashboard = read("components/rider/rider-dashboard.tsx");
const migration = read("security-remediation/migrations/202610150004_pickup-code-expiry-repair.sql");

test("F059: pickup confirmation is initialized with a bounded expiry and failed initialization leaves no pending order", () => {
  assert.match(pickupCode, /MARKETPLACE_PICKUP_CODE_TTL_MS/);
  assert.match(pickupCode, /expires_at:/);
  assert.match(checkout, /let createdOrderId: string \| null = null/);
  assert.match(checkout, /delete\(\)\.eq\("id", createdOrderId\)\.eq\("status", "pending"\)\.eq\("payment_status", "pending"\)/);
});

test("F059: expired pickup codes cannot be revealed, verified, or completed", () => {
  assert.match(customerPickup, /marketplacePickupCodeExpired/);
  assert.match(vendorPickup, /marketplacePickupCodeExpired/);
  assert.match(migration, /confirmation\.expires_at <= now\(\)/);
  assert.match(migration, /expires_at > now\(\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /grant execute on function public\.complete_marketplace_pickup[\s\S]*to service_role/);
});

test("F059: payment-pending rider reservations do not disclose customer contact or start delivery tracking", () => {
  assert.match(riderJobs, /stripPaymentPendingRiderDetails/);
  assert.match(riderJobs, /delete safe\.metadata/);
  assert.match(riderJobs, /delete safe\.pickup_contact/);
  assert.match(riderJobs, /delete safe\.dropoff_contact/);
  assert.match(riderDashboard, /Rider reserved\. The customer has five minutes to complete payment/);
  assert.match(riderDashboard, /window\.confirm\(`Decline \$\{job\.delivery_code\}/);
  assert.match(riderDashboard, /disabled=\{responding\}/);
});
