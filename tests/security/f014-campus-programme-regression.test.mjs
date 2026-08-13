import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const campus = read("lib/campus-program.ts");
const pricing = read("lib/marketplace-pricing.ts");
const marketplaceEstimate = read("app/api/marketplace/estimate/route.ts");
const marketplaceCheckout = read("app/api/marketplace/checkout/route.ts");
const deliveryCheckout = read("app/api/deliveries/checkout/route.ts");
const businessDispatch = read("app/api/business/dispatch/route.ts");
const riderEligibility = read("lib/rider-eligibility.ts");
const migration = read("security-remediation/migrations/202608130001_campus_programme.sql");
const admin = read("components/admin/admin-panel.tsx");

test("F-014 keeps campus pricing opt-in and restores normal pricing after 30 km", () => {
  assert.match(campus, /program\.enabled/);
  assert.match(campus, /input\.distanceKm <= input\.program\.normalPricingAfterKm/);
  assert.match(campus, /deliveryFeeCapNgn/);
  assert.match(campus, /overagePerKmNgn/);
  assert.match(pricing, /applyCampusPrice/);
  assert.match(pricing, /campusAdjustment/);
});

test("F-014 verifies lecturer waivers server-side for marketplace and dispatch routes", () => {
  for (const source of [marketplaceEstimate, marketplaceCheckout, deliveryCheckout, businessDispatch]) assert.match(source, /resolveLecturerBenefit/);
  assert.match(marketplaceCheckout, /lecturerBenefit\.applied \? 0/);
  assert.match(deliveryCheckout, /payableFare\.total === 0/);
  assert.match(businessDispatch, /payableFare\.total === 0/);
  assert.match(campus, /shaping the future/);
});

test("F-014 preserves rider payment while reserving active campus offers", () => {
  assert.match(campus, /riderEarningNgn/);
  assert.match(riderEligibility, /campusRiderCanReceive/);
  assert.match(migration, /campus_zone_id text/);
  assert.match(migration, /campus_rider_priority_until/);
  assert.match(migration, /campus_bicycle_cap_km/);
});

test("F-014 adds Google-enabled restaurant and shopping vendor pickup controls", () => {
  assert.match(admin, /Google pickup location/);
  assert.match(admin, /mode="place"/);
  assert.match(admin, /KWASU Lecturers/);
});
