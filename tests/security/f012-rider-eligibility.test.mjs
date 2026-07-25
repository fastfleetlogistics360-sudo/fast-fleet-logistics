import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const riderEligibility = read("lib/rider-eligibility.ts");
const riderJobs = read("app/api/rider/jobs/route.ts");
const businessOrders = read("app/api/business/orders/route.ts");
const marketplacePricing = read("lib/marketplace-pricing.ts");
const marketplaceCheckout = read("app/api/marketplace/checkout/route.ts");
const siteControls = read("app/api/admin/site-controls/route.ts");
const migration = read("security-remediation/migrations/202607260001_f012_rider_eligibility.sql");
const schema = read("supabase-schema.sql");

test("F-012 applies one configurable eligibility policy to job lists, notifications, and pre-accept checks", () => {
  assert.match(riderEligibility, /locationFreshnessMinutes/);
  assert.match(riderEligibility, /crossBorderPickupRadiusKm/);
  assert.match(riderEligibility, /bicycleMaxRouteKm/);
  assert.match(riderEligibility, /if \(bicycleDelivery\) \{/);
  assert.match(riderEligibility, /routeKm > policy\.bicycleMaxRouteKm/);
  assert.match(riderJobs, /loadDeliveryPolicy\(\)/);
  assert.match(riderJobs, /riderCanReceiveDelivery/);
  assert.match(businessOrders, /notifyApprovedRiders/);
  assert.match(businessOrders, /riderCanReceiveDelivery/);
});

test("F-012 makes database acceptance authoritative and atomically reserves bicycles", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /create or replace function public\.accept_delivery_offer/);
    assert.match(source, /make_interval\(mins => location_freshness_minutes\)/);
    assert.match(source, /pickup_distance_km > cross_border_pickup_radius_km/);
    assert.match(source, /Bicycle deliveries must be/);
    assert.match(source, /for update skip locked/);
    assert.match(source, /current_delivery_id = target_delivery\.id/);
  }
  assert.match(migration, /^begin;/m);
  assert.match(migration, /\ncommit;\s*$/);
});

test("F-012 blocks distant perishable checkout and confirms long interstate marketplace dispatch", () => {
  assert.match(marketplacePricing, /freshFoodMaxRouteKm/);
  assert.match(marketplacePricing, /This kitchen is too far for fresh delivery/);
  assert.match(marketplacePricing, /interstateDeliveryDays/);
  assert.match(marketplacePricing, /recommendedMarketplaceVehicle/);
  assert.match(marketplaceCheckout, /if \(!estimate\.allowed\)/);
  assert.match(marketplaceCheckout, /requiresInterstateConfirmation/);
  assert.match(marketplaceCheckout, /geocodeAddress/);
  assert.doesNotMatch(marketplaceCheckout, /vehicle_type:\s*"bike"/);
});

test("F-012 exposes validated policy defaults through site controls", () => {
  assert.match(siteControls, /DEFAULT_DELIVERY_POLICY/);
  assert.match(siteControls, /serializeDeliveryPolicy/);
  assert.match(siteControls, /delivery_policy/);
  assert.match(schema, /"cross_border_pickup_radius_km": 10/);
  assert.match(schema, /"location_freshness_minutes": 30/);
  assert.match(schema, /"fresh_food_max_route_km": 30/);
  assert.match(schema, /"interstate_delivery_days": 2/);
});
