import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("lib/investor-dashboard.ts", "utf8");
const dashboardRoute = readFileSync("app/api/investor/dashboard/route.ts", "utf8");
const onboardingRoute = readFileSync("app/api/investor/onboarding/route.ts", "utf8");

test("investor dashboard returns an intentionally safe delivery projection", () => {
  assert.match(dashboard, /delivery_code, status, price_ngn, created_at, delivered_at/);
  assert.doesNotMatch(dashboard, /pickup_address|dropoff_address|pickup_contact|dropoff_contact|rider_locations/);
  assert.match(dashboard, /handlerAssigned: Boolean/);
});

test("investor dashboard requires verified email and completed onboarding", () => {
  assert.match(dashboardRoute, /email_confirmed_at/);
  assert.match(dashboardRoute, /onboardingRequired/);
  assert.match(onboardingRoute, /email_confirmed_at/);
  assert.match(onboardingRoute, /encryptInvestorAccountNumber/);
});
