import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function apiRouteFiles(directory = fileURLToPath(new URL("app/api/", root))) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return apiRouteFiles(path);
    return entry.name === "route.ts" ? [path] : [];
  });
}

const rateLimit = read("lib/rate-limit.ts");
const secureStorage = read("lib/secure-storage.ts");
const quota = read("lib/storage-quota.ts");
const quotaMigration = read("supabase-storage-quota-delta.sql");
const routeMigration = read("supabase-rate-limit-delta.sql");
const serviceWorker = read("public/sw.js");

test("F-008 uses centrally named, user-first policies with an anonymous fallback", () => {
  for (const policy of [
    "uploadIngress", "uploadDeliveryProof", "supportTicketCreate", "supportMessageCreate", "liveLocationUpdate",
    "withdrawalRequest", "businessRegistration", "businessDispatchCreate", "businessTeamMutation",
    "businessOrderStatusUpdate", "businessProfileMutation", "pushSubscriptionWrite", "adminStandardMutation",
    "adminDestructiveMutation", "paymentCreate", "paymentVerify", "cronDailyCommission"
  ]) {
    assert.match(rateLimit, new RegExp(`${policy}: policy\\(`));
  }
  assert.match(rateLimit, /authenticatedUserPreferred: keyStrategy === "authenticated_user_or_ip"/);
  assert.match(rateLimit, /return digest\(`user:\$\{userId\}`\)/);
  assert.match(rateLimit, /return digest\(`ip:\$\{ip\}:ua:/);
});

test("F-008 denial responses are retryable, bounded, and log no IP or bucket key", () => {
  assert.match(rateLimit, /status: 429/);
  assert.match(rateLimit, /retry_after_seconds/);
  assert.match(rateLimit, /headers\.set\("Retry-After"/);
  const denialLogger = rateLimit.match(/function logRateLimitDenial[\s\S]*?\n}\n/)?.[0] || "";
  assert.match(denialLogger, /console\.warn\("rate_limit_denied"/);
  assert.doesNotMatch(denialLogger, /bucketKey|clientIp|userId|ip:/);
});

test("F-008 protects every current and future mutating API route or explicitly documents its protected exemption", () => {
  for (const route of apiRouteFiles()) {
    const source = readFileSync(route, "utf8");
    if (!/export async function (?:POST|PUT|PATCH|DELETE)/.test(source)) continue;
    assert.match(
      source,
      /enforceRateLimit|enforceAdminMutationRateLimit|rate-limit-exempt|verifySquadWebhook|verifyCronAuthorization/,
      `${route} exports a write handler without rate-limit coverage or a documented protected exemption`
    );
  }
  assert.match(read("app/api/auth/oauth-provider-check/route.ts"), /rate-limit-exempt/);
});

test("F-008 binds authenticated mutations before their limiter and verifies rider location ownership", () => {
  for (const route of [
    "app/api/deliveries/checkout/route.ts", "app/api/marketplace/checkout/route.ts", "app/api/wallet/topup/route.ts",
    "app/api/rider/jobs/route.ts", "app/api/rider/pickup-proof/route.ts", "app/api/rider/delivery-confirmation/route.ts"
  ]) {
    const source = read(route);
    assert.ok(source.indexOf("auth.getUser") < source.indexOf("const limited"), `${route} must authenticate before limiting`);
  }
  const location = read("app/api/location/current/route.ts");
  assert.match(location, /\.eq\("user_id", input\.userId\)/);
  assert.match(location, /delivery\.rider_id !== rider\.id/);
  assert.match(location, /\["delivered", "cancelled"\]/);
  assert.match(location, /rateLimitPolicies\.liveLocationUpdate/);
});

test("F-008 removes browser table writes from rate-limited support, location, preference, and notification flows", () => {
  for (const component of [
    "components/support/support-ticket-form.tsx", "components/support/support-widget.tsx", "components/rider/rider-dashboard.tsx",
    "components/dashboard/customer-dashboard.tsx", "components/dashboard/business-dashboard.tsx", "components/dashboard/notification-bell.tsx",
    "components/auth/phone-auth-form.tsx", "components/auth/choose-account-type-form.tsx"
  ]) {
    const source = read(component);
    assert.doesNotMatch(source, /\.from\("(?:support_tickets|support_messages|rider_locations|delivery_locations|saved_addresses|state_waitlist|notifications|users|profiles)"\)\.(?:insert|update|upsert|delete)/);
  }
  assert.match(read("app/api/support/route.ts"), /rateLimitPolicies\.supportTicketCreate/);
  assert.match(read("app/api/support/route.ts"), /createAdminClient\(\)/);
  assert.match(read("app/api/account/bootstrap/route.ts"), /rateLimitPolicies\.authSensitive/);
  assert.match(read("app/api/account/bootstrap/route.ts"), /parseSelfServiceRole/);
  assert.match(routeMigration, /drop policy if exists "Anyone can create support tickets"/);
  assert.match(routeMigration, /drop policy if exists "Anyone can create support messages"/);
});

test("F-008 storage quotas reserve before write, commit only after success, and release failed work", () => {
  assert.match(secureStorage, /reserveStorageQuota\(db, quota\)/);
  assert.ok(secureStorage.indexOf("reserveStorageQuota") < secureStorage.indexOf("\.upload(input.path"));
  assert.match(secureStorage, /commitStorageQuota\(db, quota, reservationId\)/);
  assert.match(secureStorage, /releaseStorageQuotaReservation\(db, reservationId\)/);
  assert.match(secureStorage, /removeStoredObject[\s\S]*releaseStorageQuotaObject/);
  assert.match(quota, /STORAGE_QUOTA_EXCEEDED/);
  assert.match(quota, /status: 429/);
  assert.match(quotaMigration, /create table if not exists public\.storage_quota_usage/);
  assert.match(quotaMigration, /create table if not exists public\.storage_quota_reservations/);
  assert.match(quotaMigration, /for update/);
  assert.match(quotaMigration, /grant execute on function public\.reserve_storage_quota[\s\S]*to service_role/);
  assert.doesNotMatch(quotaMigration, /grant execute[\s\S]*to authenticated/);
});

test("F-008 keeps private responses out of the service-worker cache and caches only public map place details", () => {
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  const assetCache = serviceWorker.match(/function isSafePublicAsset[\s\S]*?\n}\n/)?.[0] || "";
  assert.doesNotMatch(assetCache, /\/api\//);
  const placeDetails = read("app/api/maps/place-details/route.ts");
  assert.match(placeDetails, /s-maxage=600/);
  assert.match(placeDetails, /mapsGeocode/);
});
