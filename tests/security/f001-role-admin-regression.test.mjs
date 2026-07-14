import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import { createClient } from "@supabase/supabase-js";
import ts from "typescript";

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
}

function loadRolesModule() {
  const source = read("lib/auth/roles.ts");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020
    }
  }).outputText;
  const sandbox = { exports: {}, module: { exports: {} } };
  sandbox.exports = sandbox.module.exports;
  vm.runInNewContext(output, sandbox, { filename: "lib/auth/roles.ts" });
  return sandbox.module.exports;
}

test("F-001 SQL migration blocks user-controlled admin and KYC privilege fields", () => {
  const migration = read("security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql");

  assert.match(migration, /^begin;/m);
  assert.equal((migration.match(/^commit;/gm) || []).length, 1);
  assert.ok(migration.trim().endsWith("commit;"), "F-001 migration must commit only after all statements.");
  assert.match(migration, /add column if not exists is_admin boolean not null default false/);
  assert.match(migration, /add column if not exists kyc_status text not null default 'pending_review'/);
  assert.match(migration, /create or replace function public\.current_request_has_role_admin_privilege\(\)/);
  assert.match(migration, /create or replace function public\.protect_users_privileged_fields\(\)/);
  assert.match(migration, /create or replace function public\.protect_profiles_privileged_fields\(\)/);
  assert.match(migration, /raise exception 'Admin role can only be assigned by FastFleet admin\.'/);
  assert.match(migration, /raise exception 'Admin account type can only be assigned by FastFleet admin\.'/);
  assert.match(migration, /raise exception 'Admin flag can only be changed by FastFleet admin\.'/);
  assert.match(migration, /raise exception 'KYC status can only be changed by FastFleet admin\.'/);
  assert.match(migration, /create trigger users_protect_privileged_fields/);
  assert.match(migration, /create trigger profiles_protect_privileged_fields/);
  assert.doesNotMatch(migration, /current_user in \('postgres', 'supabase_admin'\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data ->> 'role' in \('customer', 'rider', 'business', 'admin'\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data ->> 'account_type' in \('customer', 'rider', 'business', 'admin'\)/);
});

test("F-001 role helper behavior rejects user-controlled admin", () => {
  const roles = loadRolesModule();

  assert.equal(roles.parseSelfServiceRole("customer"), "customer");
  assert.equal(roles.parseSelfServiceRole("rider"), "rider");
  assert.equal(roles.parseSelfServiceRole("driver"), "rider");
  assert.equal(roles.parseSelfServiceRole("business"), "business");
  assert.equal(roles.parseSelfServiceRole("admin"), null);
  assert.equal(roles.parseSelfServiceRole("super_admin"), null);
  assert.equal(roles.normalizeSelfServiceRole("admin", "business"), "business");
  assert.equal(roles.normalizeSelfServiceRole("staff", "customer"), "customer");
  assert.equal(roles.parseUserRole("admin"), "admin");
  assert.equal(roles.safeDashboardRedirectForRole("/admin/dashboard", "customer"), "/customer/dashboard");
});

test("F-001 auth helpers separate trusted roles from self-service roles", () => {
  const roles = read("lib/auth/roles.ts");
  const selfServiceFunction = roles.match(/export function parseSelfServiceRole[\s\S]*?^}/m)?.[0] || "";

  assert.match(roles, /export type SelfServiceRole = Exclude<UserRole, "admin">;/);
  assert.match(selfServiceFunction, /value === "customer"/);
  assert.match(selfServiceFunction, /value === "rider"/);
  assert.match(selfServiceFunction, /value === "business"/);
  assert.doesNotMatch(selfServiceFunction, /"admin"/);
  assert.match(roles, /export function parseUserRole/);
});

test("F-001 public auth routes use self-service parsing before profile writes", () => {
  const callback = read("app/auth/callback/route.ts");
  const confirm = read("app/auth/confirm/route.ts");
  const completion = read("lib/auth/profile-completion.ts");

  assert.match(callback, /parseSelfServiceRole\(requestUrl\.searchParams\.get\("role"\)\)/);
  assert.match(callback, /parseSelfServiceRole\(user\.user_metadata\?\.account_type \|\| user\.user_metadata\?\.role\)/);
  assert.match(callback, /if \(accountRole !== "admin"\) \{/);
  assert.match(confirm, /parseSelfServiceRole\(user\.user_metadata\?\.account_type \|\| user\.user_metadata\?\.role\)/);
  assert.match(confirm, /parseSelfServiceRole\(requestUrl\.searchParams\.get\("role"\) \|\| requestUrl\.searchParams\.get\("account"\)\)/);
  assert.match(confirm, /if \(accountRole !== "admin"\) \{/);
  assert.match(completion, /role: SelfServiceRole/);
});

test("F-001 client signup/login cannot self-write admin roles", () => {
  const phoneAuth = read("components/auth/phone-auth-form.tsx");
  const chooseAccount = read("components/auth/choose-account-type-form.tsx");

  assert.match(phoneAuth, /defaultRole\?: SelfServiceRole/);
  assert.match(phoneAuth, /lockedRole\?: SelfServiceRole/);
  assert.match(phoneAuth, /parseSelfServiceRole\(value\)/);
  assert.match(phoneAuth, /normalizeSelfServiceRole/);
  assert.match(phoneAuth, /if \(userRole !== "admin"\) \{/);
  assert.match(chooseAccount, /useState<SelfServiceRole>\("customer"\)/);
});

test("F-001 page and API metadata fallbacks do not trust admin metadata", () => {
  for (const path of [
    "app/hub/page.tsx",
    "app/book/page.tsx",
    "app/marketplace/listing/page.tsx",
    "app/api/marketplace/listing/route.ts"
  ]) {
    const source = read(path);
    assert.match(source, /parseUserRole\(.*profile.*account_type.*\) \|\| parseSelfServiceRole\(user\.user_metadata\?\.account_type \|\| user\.user_metadata\?\.role\)/s, path);
  }
});

test("F-001 preflight and postflight SQL are present", () => {
  const preflight = read("security-remediation/database-preflight.sql");
  const postflight = read("security-remediation/database-postflight.sql");

  assert.match(preflight, /admin_review/);
  assert.match(preflight, /role_profile_mismatch_review/);
  assert.match(postflight, /required_functions/);
  assert.match(postflight, /manual_browser_write_tests/);
});

const STAGING_CONFIRM_VALUE = "I_UNDERSTAND_THIS_IS_STAGING";
const KNOWN_PRODUCTION_SUPABASE_URLS = new Set(["https://jenvnpfdeztpayskqeeq.supabase.co"]);
const stagingEnabled = process.env.F001_STAGING_ENABLE === "1";
const stagingConfirm = process.env.F001_STAGING_CONFIRM;
const stagingUrl = process.env.F001_STAGING_SUPABASE_URL;
const productionUrl = process.env.F001_PRODUCTION_SUPABASE_URL;
const stagingAnonKey = process.env.F001_STAGING_SUPABASE_ANON_KEY;
const stagingServiceRoleKey = process.env.F001_STAGING_SUPABASE_SERVICE_ROLE_KEY;
const stagingMarkerKey = process.env.F001_STAGING_MARKER_KEY || "f001_staging_validation_marker";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function stagingSkip(extraRequired = []) {
  if (!stagingEnabled) return "Skipped until F001_STAGING_ENABLE=1 is explicitly provided.";
  const required = [
    "F001_STAGING_CONFIRM",
    "F001_STAGING_SUPABASE_URL",
    "F001_PRODUCTION_SUPABASE_URL",
    "F001_STAGING_SUPABASE_ANON_KEY",
    "F001_STAGING_SUPABASE_SERVICE_ROLE_KEY",
    ...extraRequired
  ];
  const missing = required.filter((name) => !process.env[name]);
  return missing.length ? `Skipped until explicit staging env is provided: ${missing.join(", ")}` : false;
}

function stagingClient(key = stagingAnonKey) {
  return createClient(stagingUrl, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

function serviceClient() {
  return stagingClient(stagingServiceRoleKey);
}

let stagingSafetyPromise;
async function assertStagingSafety() {
  if (!stagingSafetyPromise) {
    stagingSafetyPromise = (async () => {
      assert.equal(stagingConfirm, STAGING_CONFIRM_VALUE, "F001_STAGING_CONFIRM is missing or incorrect.");
      assert.ok(/^https:\/\/.+\.supabase\.co$/i.test(String(stagingUrl || "")), "F001_STAGING_SUPABASE_URL must be a hosted Supabase staging URL.");
      assert.notEqual(normalizeUrl(stagingUrl), normalizeUrl(productionUrl), "Staging URL matches F001_PRODUCTION_SUPABASE_URL.");
      assert.ok(!KNOWN_PRODUCTION_SUPABASE_URLS.has(normalizeUrl(stagingUrl)), "Staging URL matches a known production Supabase URL.");

      const service = serviceClient();
      const { data, error } = await service.from("platform_settings").select("value").eq("key", stagingMarkerKey).maybeSingle();
      assert.ifError(error);
      assert.ok(data?.value, "Missing staging safety marker row in public.platform_settings.");
      assert.equal(data.value.environment, "staging", "Staging safety marker environment is not staging.");
      assert.equal(data.value.allow_f001_tests, true, "Staging safety marker does not allow F-001 tests.");
    })();
  }
  await stagingSafetyPromise;
}

async function signInStaging(emailName, passwordName) {
  const client = stagingClient();
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env[emailName],
    password: process.env[passwordName]
  });
  assert.ifError(error);
  assert.ok(data.user?.id, `${emailName} did not produce an authenticated user`);
  return { client, userId: data.user.id };
}

async function loadIdentityRows(userId) {
  const service = serviceClient();
  const [{ data: userRow, error: userError }, { data: profileRow, error: profileError }] = await Promise.all([
    service.from("users").select("id, role, full_name").eq("id", userId).maybeSingle(),
    service.from("profiles").select("user_id, account_type, is_admin, kyc_status, full_name").eq("user_id", userId).maybeSingle()
  ]);
  assert.ifError(userError);
  assert.ifError(profileError);
  assert.ok(userRow, "Missing public.users row for staging test account.");
  assert.ok(profileRow, "Missing public.profiles row for staging test account.");
  return { userRow, profileRow };
}

async function assertBaselineRole(userId, roleName) {
  const { userRow, profileRow } = await loadIdentityRows(userId);
  assert.equal(userRow.role, roleName, `${roleName} test account has unexpected users.role`);
  assert.equal(profileRow.account_type, roleName, `${roleName} test account has unexpected profiles.account_type`);
  assert.equal(profileRow.is_admin, false, `${roleName} test account must not have profiles.is_admin=true`);
  return { userRow, profileRow };
}

async function expectRejected(query, label) {
  const { error } = await query;
  assert.ok(error, `${label} unexpectedly succeeded`);
  assert.match(String(error.code || error.message), /(42501|row-level security|FastFleet admin|only be changed|only be assigned)/i, label);
}

function pickPath(row, path) {
  return path.split(".").reduce((value, key) => value?.[key], row);
}

async function expectRejectedAndUnchanged({ query, label, loadRow, paths }) {
  const before = await loadRow();
  await expectRejected(query, label);
  const after = await loadRow();
  for (const path of paths) {
    assert.deepEqual(pickPath(after, path), pickPath(before, path), `${label} changed ${path}`);
  }
}

async function expectAllowed(query, label) {
  const { error } = await query;
  assert.ifError(error, label);
}

const stagingRoleAccounts = [
  ["customer", "F001_STAGING_CUSTOMER_A_EMAIL", "F001_STAGING_CUSTOMER_A_PASSWORD"],
  ["rider", "F001_STAGING_RIDER_A_EMAIL", "F001_STAGING_RIDER_A_PASSWORD"],
  ["business", "F001_STAGING_BUSINESS_A_EMAIL", "F001_STAGING_BUSINESS_A_PASSWORD"]
];

for (const [roleName, emailEnv, passwordEnv] of stagingRoleAccounts) {
  test(`F-001 staging behavior blocks ${roleName} -> admin escalation`, { skip: stagingSkip([emailEnv, passwordEnv]) }, async () => {
    await assertStagingSafety();
    const { client, userId } = await signInStaging(emailEnv, passwordEnv);
    await assertBaselineRole(userId, roleName);
    const stamp = `F001 ${roleName} smoke ${Date.now()}`;

    const loadRows = () => loadIdentityRows(userId);
    await expectRejectedAndUnchanged({
      query: client.from("users").update({ role: "admin" }).eq("id", userId),
      label: `${roleName} users.role admin mutation`,
      loadRow: loadRows,
      paths: ["userRow.role"]
    });
    await expectRejectedAndUnchanged({
      query: client.from("profiles").update({ account_type: "admin" }).eq("user_id", userId),
      label: `${roleName} profiles.account_type admin mutation`,
      loadRow: loadRows,
      paths: ["profileRow.account_type"]
    });
    await expectRejectedAndUnchanged({
      query: client.from("profiles").update({ is_admin: true }).eq("user_id", userId),
      label: `${roleName} profiles.is_admin mutation`,
      loadRow: loadRows,
      paths: ["profileRow.is_admin"]
    });
    await expectRejectedAndUnchanged({
      query: client.from("profiles").update({ kyc_status: "approved" }).eq("user_id", userId),
      label: `${roleName} profiles.kyc_status mutation`,
      loadRow: loadRows,
      paths: ["profileRow.kyc_status"]
    });
    await expectAllowed(client.from("profiles").update({ full_name: stamp }).eq("user_id", userId), `${roleName} safe full_name update`);
    const { profileRow } = await loadIdentityRows(userId);
    assert.equal(profileRow.full_name, stamp, `${roleName} safe full_name update was not persisted`);
  });
}

test("F-001 staging behavior blocks rider self-approval review fields", { skip: stagingSkip(["F001_STAGING_RIDER_A_EMAIL", "F001_STAGING_RIDER_A_PASSWORD"]) }, async () => {
  await assertStagingSafety();
  const { client, userId } = await signInStaging("F001_STAGING_RIDER_A_EMAIL", "F001_STAGING_RIDER_A_PASSWORD");
  await assertBaselineRole(userId, "rider");
  const service = serviceClient();
  const { data: application, error } = await service
    .from("rider_applications")
    .select("id, status, reviewed_by, reviewed_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  assert.ifError(error);
  assert.ok(application?.id, "rider_a must have a rider_applications row for F-001 staging validation.");

  const loadApplication = async () => {
    const { data, error: loadError } = await service.from("rider_applications").select("id, status, reviewed_by, reviewed_at").eq("id", application.id).maybeSingle();
    assert.ifError(loadError);
    assert.ok(data, "Missing rider_applications row during F-001 staging validation.");
    return { application: data };
  };

  await expectRejectedAndUnchanged({
    query: client.from("rider_applications").update({ status: "approved" }).eq("id", application.id),
    label: "rider_a rider_applications.status self-approval",
    loadRow: loadApplication,
    paths: ["application.status"]
  });
  await expectRejectedAndUnchanged({
    query: client.from("rider_applications").update({ reviewed_by: userId }).eq("id", application.id),
    label: "rider_a rider_applications.reviewed_by mutation",
    loadRow: loadApplication,
    paths: ["application.reviewed_by"]
  });
  await expectRejectedAndUnchanged({
    query: client.from("rider_applications").update({ reviewed_at: new Date().toISOString() }).eq("id", application.id),
    label: "rider_a rider_applications.reviewed_at mutation",
    loadRow: loadApplication,
    paths: ["application.reviewed_at"]
  });
});

test("F-001 staging behavior blocks business self-approval review fields", { skip: stagingSkip(["F001_STAGING_BUSINESS_A_EMAIL", "F001_STAGING_BUSINESS_A_PASSWORD"]) }, async () => {
  await assertStagingSafety();
  const { client, userId } = await signInStaging("F001_STAGING_BUSINESS_A_EMAIL", "F001_STAGING_BUSINESS_A_PASSWORD");
  await assertBaselineRole(userId, "business");
  const service = serviceClient();
  const { data: business, error } = await service
    .from("business_profiles")
    .select("id, registration_status, reviewed_by, reviewed_at")
    .eq("user_id", userId)
    .maybeSingle();
  assert.ifError(error);
  assert.ok(business?.id, "business_a must have a business_profiles row for F-001 staging validation.");

  const loadBusiness = async () => {
    const { data, error: loadError } = await service.from("business_profiles").select("id, registration_status, reviewed_by, reviewed_at").eq("id", business.id).maybeSingle();
    assert.ifError(loadError);
    assert.ok(data, "Missing business_profiles row during F-001 staging validation.");
    return { business: data };
  };

  await expectRejectedAndUnchanged({
    query: client.from("business_profiles").update({ registration_status: "active" }).eq("id", business.id),
    label: "business_a business_profiles.registration_status self-approval",
    loadRow: loadBusiness,
    paths: ["business.registration_status"]
  });
  await expectRejectedAndUnchanged({
    query: client.from("business_profiles").update({ reviewed_by: userId }).eq("id", business.id),
    label: "business_a business_profiles.reviewed_by mutation",
    loadRow: loadBusiness,
    paths: ["business.reviewed_by"]
  });
  await expectRejectedAndUnchanged({
    query: client.from("business_profiles").update({ reviewed_at: new Date().toISOString() }).eq("id", business.id),
    label: "business_a business_profiles.reviewed_at mutation",
    loadRow: loadBusiness,
    paths: ["business.reviewed_at"]
  });
});

test("F-001 staging behavior keeps existing administrator DB access", { skip: stagingSkip(["F001_STAGING_ADMIN_A_EMAIL", "F001_STAGING_ADMIN_A_PASSWORD"]) }, async () => {
  await assertStagingSafety();
  const { client, userId } = await signInStaging("F001_STAGING_ADMIN_A_EMAIL", "F001_STAGING_ADMIN_A_PASSWORD");
  const service = serviceClient();
  const { userRow, profileRow } = await loadIdentityRows(userId);
  assert.equal(userRow.role, "admin", "admin_a must have users.role=admin in staging.");
  assert.equal(profileRow.account_type, "admin", "admin_a must have profiles.account_type=admin in staging.");
  assert.equal(profileRow.is_admin, true, "admin_a must have profiles.is_admin=true in staging.");

  const { data: marker, error: markerError } = await service.from("platform_settings").select("value").eq("key", stagingMarkerKey).maybeSingle();
  assert.ifError(markerError);
  const originalMarker = marker.value;
  const updatedMarker = { ...originalMarker, admin_a_smoke_checked_at: new Date().toISOString() };
  await expectAllowed(client.from("platform_settings").update({ value: updatedMarker }).eq("key", stagingMarkerKey), "admin_a safe platform_settings update");
  const { data: afterAdminUpdate, error: afterError } = await service.from("platform_settings").select("value").eq("key", stagingMarkerKey).maybeSingle();
  assert.ifError(afterError);
  assert.ok(afterAdminUpdate?.value?.admin_a_smoke_checked_at, "admin_a safe update was not persisted.");
  await expectAllowed(service.from("platform_settings").update({ value: originalMarker }).eq("key", stagingMarkerKey), "service role restore staging marker");
});

test("F-001 staging behavior normalizes signup role=admin to customer", { skip: stagingSkip([]) }, async () => {
  await assertStagingSafety();
  const anon = stagingClient();
  const service = serviceClient();
  const email = `f001-role-admin-${Date.now()}@example.invalid`;
  const password = `F001-${Date.now()}-Password!`;
  const { data, error } = await anon.auth.signUp({
    email,
    password,
    options: {
      data: {
        role: "admin",
        account_type: "admin",
        is_admin: true,
        full_name: "F001 Role Admin Attempt"
      }
    }
  });

  assert.ifError(error);
  assert.ok(data.user?.id, "staging signup did not create a test auth user");
  const userId = data.user.id;

  try {
    const [{ data: appUser, error: userError }, { data: profile, error: profileError }] = await Promise.all([
      service.from("users").select("id, role").eq("id", userId).maybeSingle(),
      service.from("profiles").select("user_id, account_type, is_admin, kyc_status").eq("user_id", userId).maybeSingle()
    ]);
    assert.ifError(userError);
    assert.ifError(profileError);
    assert.equal(appUser?.role, "customer");
    assert.equal(profile?.account_type, "customer");
    assert.equal(profile?.is_admin, false);
    assert.equal(profile?.kyc_status, "pending_review");
  } finally {
    await service.auth.admin.deleteUser(userId).catch(() => null);
  }
});
