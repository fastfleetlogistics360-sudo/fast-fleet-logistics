import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const serviceWorker = read("public/sw.js");
const sessionCleanup = read("lib/service-worker-session.ts");
const pwaRegister = read("components/layout/pwa-register.tsx");
const checkoutPages = [
  read("components/marketplace/order-marketplace.tsx"),
  read("components/marketplace/shopping-marketplace.tsx")
];
const logoutFiles = [
  read("components/layout/site-shell.tsx"),
  read("components/dashboard/customer-dashboard.tsx"),
  read("components/dashboard/business-dashboard.tsx"),
  read("components/rider/rider-dashboard.tsx"),
  read("components/dashboard/account-deletion.tsx"),
  read("components/admin/admin-panel.tsx")
];

test("F-006 removes offline checkout persistence, replay, and background sync", () => {
  assert.doesNotMatch(serviceWorker, /queueOfflineBooking|replayOfflineBookings|OFFLINE_QUEUE|sync-bookings|sync-booking/);
  assert.doesNotMatch(serviceWorker, /addEventListener\("sync"/);
  assert.doesNotMatch(serviceWorker, /indexedDB\.open/);
  assert.doesNotMatch(serviceWorker, /request\.clone\(\)\.text|Array\.from\(request\.headers/);
  assert.match(serviceWorker, /indexedDB\.deleteDatabase\(LEGACY_CHECKOUT_QUEUE_DATABASE\)/);
  assert.match(serviceWorker, /request\.method !== "GET"/);
  assert.match(serviceWorker, /event\.respondWith\(fetch\(request\)\.catch\(\(\) => offlineMutationResponse\(url\)\)\)/);
});

test("F-006 gives an offline checkout a clear non-replayable response while preserving online server checkout", () => {
  assert.match(serviceWorker, /Reconnect and confirm your checkout again\./);
  assert.match(serviceWorker, /status: 503/);
  for (const page of checkoutPages) {
    assert.match(page, /fetch\("\/api\/marketplace\/checkout"/);
    assert.match(page, /setLoading\(false\)/);
  }
});

test("F-006 removes old user worker state on activation, logout, and account switching", () => {
  assert.match(serviceWorker, /Promise\.all\(\[deleteObsoleteCaches\(\), deleteLegacyCheckoutQueue\(\)\]\)/);
  assert.match(serviceWorker, /data\.type === SESSION_CLEARED/);
  assert.match(serviceWorker, /clearSessionState\(\)/);
  assert.match(sessionCleanup, /export async function clearServiceWorkerSession/);
  assert.match(sessionCleanup, /type: SESSION_CLEARED/);
  assert.match(sessionCleanup, /indexedDB\.deleteDatabase\(LEGACY_CHECKOUT_QUEUE_DATABASE\)/);
  assert.match(pwaRegister, /supabase\.auth\.onAuthStateChange/);
  assert.match(pwaRegister, /previousUserId !== nextUserId/);
  for (const file of logoutFiles) assert.match(file, /clearServiceWorkerSession\(\)/);
});

test("F-006 never caches private pages, authenticated APIs, or delivery proof access", () => {
  assert.match(serviceWorker, /if \(isPrivateRequest\(url\.pathname\)\)/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  assert.doesNotMatch(serviceWorker, /cache\.put\(request, response\.clone\(\)\).*navigate/s);
  for (const path of ["/api/", "/account", "/admin", "/business/", "/customer/", "/dashboard", "/delivery/", "/rider/", "/wallet", "/book", "/marketplace/", "/auth"]) {
    assert.match(serviceWorker, new RegExp(`pathname\\.startsWith\\("${escapeRegExp(path)}"\\)`));
  }
  assert.match(serviceWorker, /pathname === "\/hub"/);
  assert.match(serviceWorker, /pathname === "\/choose-account-type"/);
  assert.doesNotMatch(serviceWorker, /fastfleet-pages-v\d+/);
});

test("F-006 caches only same-origin public static assets and honors private cache directives", () => {
  assert.match(serviceWorker, /if \(url\.origin !== self\.location\.origin\) return/);
  assert.match(serviceWorker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(serviceWorker, /!cacheControl\.includes\("no-store"\)/);
  assert.match(serviceWorker, /!cacheControl\.includes\("private"\)/);
  assert.match(serviceWorker, /!vary\.includes\("cookie"\)/);
  assert.match(serviceWorker, /!vary\.includes\("authorization"\)/);
  assert.match(serviceWorker, /!response\.headers\.has\("Set-Cookie"\)/);
  assert.match(serviceWorker, /SAFE_PUBLIC_PAGE_PATHS/);
});

test("F-006 uses a versioned public cache and deletes obsolete caches", () => {
  assert.match(serviceWorker, /const CACHE_NAME = "fastfleet-public-shell-v15"/);
  assert.match(serviceWorker, /keys\.filter\(\(key\) => key !== CACHE_NAME\)/);
  assert.match(serviceWorker, /caches\.delete\(key\)/);
  assert.match(sessionCleanup, /PRIVATE_CACHE_PREFIXES/);
});

test("F-006 notification clicks stay on the Fast Fleets origin", () => {
  assert.match(serviceWorker, /safeNotificationPath\(event\.notification\.data\?\.url\)/);
  assert.match(serviceWorker, /!value\.startsWith\("\/"\)/);
  assert.match(serviceWorker, /value\.startsWith\("\/\/"\)/);
  assert.match(serviceWorker, /destination\.origin !== self\.location\.origin/);
  assert.match(serviceWorker, /return "\/hub"/);
});

test("F-006 does not change secure upload, proof privacy, payment, or wallet implementation", () => {
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
  assert.doesNotMatch(serviceWorker, /supabase\.storage|createSignedUrl|getPublicUrl/);
  assert.doesNotMatch(serviceWorker, /walletCredit|commissionRate|paymentIntent/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
