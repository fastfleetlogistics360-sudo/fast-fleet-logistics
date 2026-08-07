import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("F-013 keeps Supabase configuration environment-only and protects readiness details", () => {
  const config = read("lib/supabase/config.ts");
  const readiness = read("app/api/health/readiness/route.ts");

  assert.doesNotMatch(config, /FALLBACK_SUPABASE|jenvnpfdeztpayskqeeq|eyJhbGciOiJIUzI1Ni/);
  assert.match(config, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(config, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(readiness, /authorizeCronRequest\(request\)/);
  assert.match(readiness, /Readiness monitoring authorization required/);
});

test("F-013 makes vendor availability normalized, visible, and checkout-enforced", () => {
  const restaurants = read("lib/restaurant-menu.ts");
  const malls = read("lib/mall-menu.ts");
  const checkout = read("app/api/marketplace/checkout/route.ts");
  const restaurantMarketplace = read("components/marketplace/order-marketplace.tsx");
  const shoppingMarketplace = read("components/marketplace/shopping-marketplace.tsx");

  assert.match(restaurants, /operatingStatus/);
  assert.match(malls, /operatingStatus/);
  assert.match(checkout, /findClosedMarketplaceVendor/);
  assert.match(checkout, /currently closed and cannot accept orders/);
  assert.match(restaurantMarketplace, /Open for orders/);
  assert.match(shoppingMarketplace, /vendorStatusLabel/);
});

test("F-013 protects public lookup and error boundaries", () => {
  const tracking = read("app/api/tracking/route.ts");
  const rateLimits = read("lib/rate-limit.ts");
  const deliveryEstimate = read("app/api/deliveries/estimate/route.ts");
  const marketplaceEstimate = read("app/api/marketplace/estimate/route.ts");
  const mapsDistance = read("app/api/maps/distance/route.ts");
  const mapsReverseGeocode = read("app/api/maps/reverse-geocode/route.ts");
  const mapsPlaceDetails = read("app/api/maps/place-details/route.ts");
  const adminAuth = read("lib/admin-auth.ts");
  const nextConfig = read("next.config.ts");

  assert.match(rateLimits, /trackingLookup/);
  assert.match(tracking, /enforceRateLimit\(request, rateLimitPolicies\.trackingLookup\)/);
  assert.match(tracking, /\.eq\("delivery_code", code\)/);
  assert.match(tracking, /\.eq\("order_code", code\)/);
  assert.doesNotMatch(tracking, /\.rpc\(/);
  assert.doesNotMatch(deliveryEstimate, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(marketplaceEstimate, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(mapsDistance, /error instanceof Error \? error\.message/);
  assert.doesNotMatch(mapsReverseGeocode, /payload\.error_message/);
  assert.doesNotMatch(mapsPlaceDetails, /Google Maps API key is not configured/);
  assert.match(adminAuth, /__Host-fastfleet_admin_session/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /X-Frame-Options/);
  assert.match(nextConfig, /X-Content-Type-Options/);
});
