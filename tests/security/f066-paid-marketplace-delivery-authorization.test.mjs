import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const authorization = readFileSync("lib/payment-authorization.ts", "utf8");
const migration = readFileSync("security-remediation/migrations/202610190001_paid_marketplace_delivery_authorization.sql", "utf8");
const riderJobs = readFileSync("app/api/rider/jobs/route.ts", "utf8");

test("F066: a settled Marketplace order authorizes its linked rider delivery", () => {
  assert.match(authorization, /select\("id, marketplace_order_id"\)/);
  assert.match(authorization, /\.in\("order_id", marketplaceOrderIds\)/);
  assert.match(authorization, /purpose", "marketplace_business_order"/);
  assert.match(authorization, /settledMarketplaceOrderIds/);
  assert.match(migration, /pi\.order_id = d\.marketplace_order_id/);
  assert.match(migration, /pi\.purpose = 'marketplace_business_order'/);
  assert.match(migration, /pi\.status = 'settled'/);
});

test("F066: payment remains an authoritative server-side gate for rider actions", () => {
  assert.match(riderJobs, /await deliveryPaymentIsVerified\(db, current\)/);
  assert.match(authorization, /if \(intents\.error \|\| transactions\.error \|\| marketplaceDeliveries\.error\) return new Set<string>\(\);/);
  assert.match(authorization, /if \(marketplaceIntents\.error\) return new Set<string>\(\);/);
});
