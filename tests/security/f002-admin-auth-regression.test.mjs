import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ADMIN_SESSION_MAX_AGE_SECONDS,
  AdminAuthConfigurationError,
  createAdminSession,
  getAdminAuthConfig,
  isAuthorizedAdminState,
  isSameOriginAdminMutation,
  verifyAdminCredentials,
  verifyAdminSession
} from "../../lib/admin-auth.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const validEnvironment = {
  FASTFLEET_ADMIN_USERNAME: "configured-operator",
  FASTFLEET_ADMIN_PASSWORD: "configured-password",
  FASTFLEET_ADMIN_SECRET: "a-secure-session-secret-with-more-than-32-characters",
  FASTFLEET_ADMIN_USER_ID: "123e4567-e89b-42d3-a456-426614174000"
};

test("F-002 admin configuration fails closed for missing and empty required values", () => {
  for (const key of ["FASTFLEET_ADMIN_USERNAME", "FASTFLEET_ADMIN_PASSWORD", "FASTFLEET_ADMIN_SECRET", "FASTFLEET_ADMIN_USER_ID"]) {
    assert.throws(
      () => getAdminAuthConfig({ ...validEnvironment, [key]: undefined }),
      AdminAuthConfigurationError,
      `${key} must be required`
    );
    assert.throws(
      () => getAdminAuthConfig({ ...validEnvironment, [key]: "   " }),
      AdminAuthConfigurationError,
      `${key} must reject whitespace-only values`
    );
  }
});

test("F-002 rejects weak secrets and invalid Supabase user IDs", () => {
  assert.throws(
    () => getAdminAuthConfig({ ...validEnvironment, FASTFLEET_ADMIN_SECRET: "too-short" }),
    /at least 32 characters/
  );
  assert.throws(
    () => getAdminAuthConfig({ ...validEnvironment, FASTFLEET_ADMIN_USER_ID: "not-a-user-id" }),
    /valid Supabase user UUID/
  );
});

test("F-002 has no source-code fallback credentials or optional profile switch", () => {
  const auth = read("lib/admin-auth.ts");
  const sources = [
    auth,
    read("app/api/admin/_auth.ts"),
    read("app/api/admin/login/route.ts"),
    read("app/admin/page.tsx")
  ].join("\n");

  assert.doesNotMatch(sources, /FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE/);
  assert.doesNotMatch(auth, /process\.env\.FASTFLEET_ADMIN_(?:USERNAME|PASSWORD|SECRET)\s*\|\|/);

  const config = getAdminAuthConfig(validEnvironment);
  const retiredUsername = String.fromCharCode(70, 97, 115, 116, 70, 108, 101, 101, 116, 65, 100, 109, 105, 110);
  const retiredPassword = String.fromCharCode(70, 97, 115, 116, 102, 108, 101, 101, 116, 51, 54, 48, 64, 35);
  assert.equal(verifyAdminCredentials(retiredUsername, retiredPassword, config), false);
});

test("F-002 signed admin sessions reject tampering, expiry, and identity mismatch", () => {
  const config = getAdminAuthConfig(validEnvironment);
  const now = Date.UTC(2026, 6, 16, 12);
  const session = createAdminSession(now, config);
  const payload = verifyAdminSession(session, now + 1_000, config);

  assert.equal(payload?.version, 1);
  assert.equal(payload?.userId, config.userId);
  assert.equal(payload?.expiresAt - payload?.issuedAt, ADMIN_SESSION_MAX_AGE_SECONDS);
  assert.equal(verifyAdminSession(`${session.slice(0, -1)}x`, now + 1_000, config), null);
  assert.equal(verifyAdminSession(session, now + ADMIN_SESSION_MAX_AGE_SECONDS * 1_000, config), null);
  assert.equal(
    verifyAdminSession(session, now + 1_000, { ...config, userId: "123e4567-e89b-42d3-a456-426614174001" }),
    null
  );
});

test("F-002 rejects missing, demoted, deleted, disabled, and mismatched admins immediately", () => {
  const userId = validEnvironment.FASTFLEET_ADMIN_USER_ID;
  const valid = {
    authUser: { id: userId },
    profile: { userId, isAdmin: true },
    failed: false
  };

  assert.equal(isAuthorizedAdminState(userId, valid), true);
  assert.equal(isAuthorizedAdminState(userId, { ...valid, profile: { userId, isAdmin: false } }), false);
  assert.equal(isAuthorizedAdminState(userId, { ...valid, profile: null }), false);
  assert.equal(isAuthorizedAdminState(userId, { ...valid, profile: { userId, isAdmin: true, deletedAt: new Date().toISOString() } }), false);
  assert.equal(isAuthorizedAdminState(userId, { ...valid, authUser: null }), false);
  assert.equal(
    isAuthorizedAdminState(userId, { ...valid, authUser: { id: userId, bannedUntil: new Date(Date.now() + 60_000).toISOString() } }),
    false
  );
  assert.equal(
    isAuthorizedAdminState(userId, { ...valid, authUser: { id: "123e4567-e89b-42d3-a456-426614174001" } }),
    false
  );
  assert.equal(isAuthorizedAdminState(userId, { ...valid, failed: true }), false);
});

test("F-002 same-origin protection rejects cross-origin and headerless mutations", () => {
  assert.equal(
    isSameOriginAdminMutation(new Request("https://fastfleet.com.ng/api/admin/states", { method: "POST", headers: { origin: "https://fastfleet.com.ng" } })),
    true
  );
  assert.equal(
    isSameOriginAdminMutation(new Request("http://localhost:3000/api/admin/states", { method: "POST", headers: { referer: "http://localhost:3000/admin" } })),
    true
  );
  assert.equal(
    isSameOriginAdminMutation(new Request("https://fastfleet.com.ng/api/admin/states", { method: "POST", headers: { origin: "https://attacker.example" } })),
    false
  );
  assert.equal(isSameOriginAdminMutation(new Request("https://fastfleet.com.ng/api/admin/states", { method: "POST" })), false);
  assert.equal(isSameOriginAdminMutation(new Request("https://fastfleet.com.ng/api/admin/states", { method: "GET" })), true);
});

test("F-002 login verifies configuration, credentials, and Supabase authority before setting a cookie", () => {
  const login = read("app/api/admin/login/route.ts");
  const credentialCheck = login.indexOf("verifyAdminCredentials");
  const authorityCheck = login.indexOf("hasCurrentSupabaseAdminAuthority");
  const cookieWrite = login.indexOf("response.cookies.set");

  assert.ok(login.includes("enforceRateLimit(request, rateLimitPolicies.adminLogin)"), "Admin login rate limiting must remain enabled.");
  assert.ok(login.includes("isSameOriginAdminMutation(request)"), "Admin login must reject cross-origin requests.");
  assert.ok(credentialCheck >= 0 && authorityCheck > credentialCheck && cookieWrite > authorityCheck);
  assert.match(login, /Invalid admin credentials\./);
  assert.doesNotMatch(login, /Invalid admin username or password/);
  assert.match(login, /Admin access is temporarily unavailable\./);
});

test("F-002 every protected admin mutation passes its Request to the shared helper", () => {
  const routes = [
    "app/api/admin/businesses/route.ts",
    "app/api/admin/company-transactions/route.ts",
    "app/api/admin/deliveries/route.ts",
    "app/api/admin/fleet-assets/route.ts",
    "app/api/admin/hub-promotion-slides/route.ts",
    "app/api/admin/main-hero-slides/route.ts",
    "app/api/admin/malls/route.ts",
    "app/api/admin/marketplace-listings/route.ts",
    "app/api/admin/restaurants/route.ts",
    "app/api/admin/riders/route.ts",
    "app/api/admin/risk-signals/route.ts",
    "app/api/admin/site-controls/route.ts",
    "app/api/admin/states/route.ts",
    "app/api/admin/withdrawals/route.ts",
    "app/api/uploads/route.ts"
  ];

  for (const route of routes) {
    assert.match(read(route), /requireAdminSession\(request\)/, route);
  }
});

test("F-002 admin page and API helper always recheck the trusted Supabase profile", () => {
  const page = read("app/admin/page.tsx");
  const helper = read("app/api/admin/_auth.ts");

  assert.match(page, /await requireAdminSession\(\)/);
  assert.match(helper, /verifyAdminSession/);
  assert.match(helper, /auth\.admin\.getUserById\(userId\)/);
  assert.match(helper, /\.select\("user_id, is_admin, deleted_at"\)/);
  assert.match(helper, /hasCurrentSupabaseAdminAuthority\(session\.userId\)/);
});

test("F-002 logout rejects cross-origin requests and clears the secure session cookie", () => {
  const logout = read("app/api/admin/logout/route.ts");
  assert.match(logout, /isSameOriginAdminMutation\(request\)/);
  assert.match(logout, /httpOnly: true/);
  assert.match(logout, /sameSite: "lax"/);
  assert.match(logout, /maxAge: 0/);
});
