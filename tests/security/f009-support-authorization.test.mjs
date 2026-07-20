import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { createSupportTicketAtomic, SupportPersistenceError } from "../../lib/support/atomic-ticket.ts";
import {
  isSupportIdempotencyKey,
  newSupportIdempotencyKey,
  normalizeSupportSource,
  normalizeSupportTopic,
  supportTopics
} from "../../lib/support/policy.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const basePath = fileURLToPath(new URL(specifier.slice(2), root));
    const resolved = [`${basePath}.ts`, `${basePath}.tsx`, `${basePath}/index.ts`, `${basePath}/index.tsx`].find(existsSync);
    if (!resolved) return nextResolve(specifier, context);
    return { url: pathToFileURL(resolved).href, shortCircuit: true };
  }
});

const [{ createSupportPostHandler }, { supportClientIp }, { verifySupportTurnstile }] = await Promise.all([
  import("../../lib/support/post-handler.ts"),
  import("../../lib/support/client-ip.ts"),
  import("../../lib/support/turnstile.ts")
]);
const migrationPath = "security-remediation/migrations/202607200001_f009_support_authorization.sql";
const migration = read(migrationPath);
const schema = read("supabase-schema.sql");
const route = read("app/api/support/route.ts");
const postHandler = read("lib/support/post-handler.ts");

const requestKey = "132654e6-d6f0-4dc5-a8ab-8a977e701c31";

function supportRequest(overrides = {}, headers = {}) {
  return new Request("https://fastfleets.example/api/support", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      source: "form",
      topic: "other",
      body: "A behavioral support request",
      name: "Anonymous User",
      email: "anonymous@example.com",
      phone: "+2348000000000",
      idempotencyKey: requestKey,
      turnstileToken: "turnstile-token",
      ...overrides
    })
  });
}

function postDependencies(overrides = {}) {
  return {
    getUser: async () => null,
    getProfile: async () => null,
    trustedClientIp: () => "203.0.113.10",
    enforceRateLimits: async () => null,
    verifyTurnstile: async () => ({ ok: true }),
    createTicket: async () => ({ ticketId: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: true }),
    ...overrides
  };
}

test("F-009 migration is transactional, non-destructive, and service-role-only", () => {
  assert.match(migration, /^begin;/m);
  assert.equal((migration.match(/^commit;/gm) || []).length, 1);
  assert.ok(migration.trim().endsWith("commit;"));
  assert.match(migration, /add column if not exists idempotency_key uuid/);
  assert.match(migration, /create unique index if not exists support_tickets_idempotency_key_unique/);
  assert.doesNotMatch(migration, /drop table|truncate table|delete from public\.support_/i);
  assert.match(migration, /revoke all on function public\.create_support_ticket_with_messages[\s\S]*from anon/);
  assert.match(migration, /revoke all on function public\.create_support_ticket_with_messages[\s\S]*from authenticated/);
  assert.match(migration, /grant execute on function public\.create_support_ticket_with_messages[\s\S]*to service_role/);
});

test("F-009 removes permissive support writes and splits owner/admin reads", () => {
  for (const sql of [migration, schema]) {
    assert.doesNotMatch(sql, /create policy "Anyone can create support (?:tickets|messages)"/);
    assert.doesNotMatch(sql, /on public\.support_(?:tickets|messages) for insert\s+with check \(true\)/);
    assert.match(sql, /create policy "Authenticated owners read support tickets"[\s\S]*to authenticated[\s\S]*user_id = \(select auth\.uid\(\)\)/);
    assert.match(sql, /create policy "Authenticated owners read support messages"[\s\S]*st\.user_id = \(select auth\.uid\(\)\)/);
    assert.doesNotMatch(sql, /create policy "Verified admins read support (?:tickets|messages)"/);
    assert.match(sql, /revoke all on public\.support_tickets from authenticated/);
    assert.match(sql, /revoke all on public\.support_messages from authenticated/);

    const ticketGrant = sql.match(/grant select \([\s\S]*?\) on public\.support_tickets to authenticated/)?.[0] || "";
    assert.match(ticketGrant, /id, user_id, delivery_id/);
    assert.doesNotMatch(ticketGrant, /admin_notes|assigned_admin_id|idempotency_key/);
    const messageGrant = sql.match(/grant select \([\s\S]*?\) on public\.support_messages to authenticated/)?.[0] || "";
    assert.match(messageGrant, /id, ticket_id, sender_type, body, created_at/);
    assert.doesNotMatch(messageGrant, /sender_user_id/);
  }
});

test("F-009 canonical schema cannot recreate the original finding", () => {
  const supportPolicies = schema.slice(schema.indexOf("-- F-009 support authorization."), schema.indexOf('drop policy if exists "Users create and admins manage deletion requests"'));
  assert.ok(supportPolicies.length > 0);
  assert.doesNotMatch(supportPolicies, /for all|for insert|with check \(true\)/i);
  assert.match(schema, /create or replace function public\.create_support_ticket_with_messages/);
  assert.match(schema, /support_messages_body_length_check/);
  assert.match(schema, /support_tickets_idempotency_key_unique/);
});

test("F-009 server derives ownership, contact identity, priority, and sender identities", () => {
  assert.match(postHandler, /userId: user\?\.id \|\| null/);
  assert.match(postHandler, /user\s*\?\s*cleanSupportText\(profile\?\.full_name/);
  assert.match(postHandler, /user\s*\?\s*cleanSupportText\(profile\?\.email/);
  assert.match(postHandler, /user\s*\?\s*cleanSupportText\(profile\?\.phone/);
  assert.match(postHandler, /priority: policy\.priority/);
  assert.match(postHandler, /botMessage: source === "widget" \? policy\.automatedReply : null/);
  assert.doesNotMatch(postHandler, /body\.(?:user_id|sender_type|priority|automatedReply)/);
  assert.match(migration, /values \(inserted_ticket_id, 'bot', null, next_bot_message\)/);
  assert.match(migration, /values \(inserted_ticket_id, 'customer', next_user_id, next_customer_message\)/);
});

test("F-009 support clients cannot bypass the atomic server route", () => {
  for (const component of ["components/support/support-ticket-form.tsx", "components/support/support-widget.tsx"]) {
    const source = read(component);
    assert.match(source, /fetch\("\/api\/support"/);
    assert.doesNotMatch(source, /\.from\("support_(?:tickets|messages)"\)/);
    assert.doesNotMatch(source, /priority:|sender_type:|automatedReply:/);
    assert.match(source, /idempotencyKey/);
    assert.match(source, /turnstileToken/);
  }
  assert.doesNotMatch(route, /\.from\("support_(?:tickets|messages)"\)\.(?:insert|update|upsert|delete)/);
  assert.match(route, /createSupportTicketAtomic/);
  assert.match(route, /createSupportPostHandler/);
  assert.doesNotMatch(read("components/support/support-widget.tsx"), /localStorage|pending_support_ticket/);
});

test("F-009 POST /api/support behavior verifies anonymous callers and returns no ticket identifier", async () => {
  let verification;
  let persisted;
  const handler = createSupportPostHandler(postDependencies({
    trustedClientIp: () => "198.51.100.25",
    verifyTurnstile: async (input) => {
      verification = input;
      return { ok: true };
    },
    createTicket: async (input) => {
      persisted = input;
      return { ticketId: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: true };
    }
  }));

  const response = await handler(supportRequest());
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.deepEqual(body, { created: true });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(verification.remoteIp, "198.51.100.25");
  assert.equal(verification.idempotencyKey, requestKey);
  assert.equal(persisted.userId, null);
  assert.equal(persisted.contactEmail, "anonymous@example.com");
});

test("F-009 POST /api/support rejects a mocked Turnstile failure before persistence", async () => {
  let persistenceCalls = 0;
  const handler = createSupportPostHandler(postDependencies({
    verifyTurnstile: async () => ({ ok: false, code: "TURNSTILE_INVALID" }),
    createTicket: async () => {
      persistenceCalls += 1;
      return { ticketId: crypto.randomUUID(), created: true };
    }
  }));

  const response = await handler(supportRequest());
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "TURNSTILE_INVALID");
  assert.equal(persistenceCalls, 0);
});

test("F-009 POST /api/support ignores spoofed contact fields for authenticated users", async () => {
  let turnstileCalls = 0;
  let persisted;
  const handler = createSupportPostHandler(postDependencies({
    getUser: async () => ({
      id: "625cead0-98c1-4dae-a5fa-b6a7c6cd9736",
      email: "auth@example.com",
      phone: "+2348111111111",
      user_metadata: { full_name: "Auth Metadata" }
    }),
    getProfile: async () => ({ full_name: "Profile Name", email: "profile@example.com", phone: "+2348222222222" }),
    verifyTurnstile: async () => {
      turnstileCalls += 1;
      return { ok: true };
    },
    createTicket: async (input) => {
      persisted = input;
      return { ticketId: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: true };
    }
  }));

  const response = await handler(supportRequest({ name: "Spoofed", email: "spoofed@example.com", phone: "+2348999999999" }));
  assert.equal(response.status, 201);
  assert.equal(turnstileCalls, 0);
  assert.equal(persisted.userId, "625cead0-98c1-4dae-a5fa-b6a7c6cd9736");
  assert.equal(persisted.contactName, "Profile Name");
  assert.equal(persisted.contactEmail, "profile@example.com");
  assert.equal(persisted.contactPhone, "+2348222222222");
  assert.equal((await response.json()).ticketId, "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f");
});

test("F-009 POST /api/support profile lookup failures still ignore request identity", async () => {
  let persisted;
  const handler = createSupportPostHandler(postDependencies({
    getUser: async () => ({
      id: "625cead0-98c1-4dae-a5fa-b6a7c6cd9736",
      email: "auth@example.com",
      phone: "+2348111111111",
      user_metadata: { full_name: "Auth Metadata" }
    }),
    getProfile: async () => {
      throw new Error("profile lookup unavailable");
    },
    createTicket: async (input) => {
      persisted = input;
      return { ticketId: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: true };
    }
  }));

  const response = await handler(supportRequest({ name: "Spoofed", email: "spoofed@example.com", phone: "+2348999999999" }));
  assert.equal(response.status, 201);
  assert.equal(persisted.contactName, "Auth Metadata");
  assert.equal(persisted.contactEmail, "auth@example.com");
  assert.equal(persisted.contactPhone, "+2348111111111");
});

test("F-009 POST /api/support handles concurrent same-key retries and rejects conflicting reuse", async () => {
  const records = new Map();
  let sequence = 0;
  const createTicket = async (input) => {
    await Promise.resolve();
    const signature = JSON.stringify(input);
    const existing = records.get(input.idempotencyKey);
    if (existing) {
      if (existing.signature !== signature) throw new SupportPersistenceError();
      return { ticketId: existing.ticketId, created: false };
    }
    const ticketId = `8ef8a4d0-2f75-4eb7-a668-${String(++sequence).padStart(12, "0")}`;
    records.set(input.idempotencyKey, { signature, ticketId });
    return { ticketId, created: true };
  };
  const handler = createSupportPostHandler(postDependencies({
    getUser: async () => ({ id: "625cead0-98c1-4dae-a5fa-b6a7c6cd9736", email: "owner@example.com" }),
    createTicket
  }));

  const [first, concurrentRetry] = await Promise.all([handler(supportRequest()), handler(supportRequest())]);
  assert.deepEqual([first.status, concurrentRetry.status].sort(), [200, 201]);
  const firstBody = await first.json();
  const retryBody = await concurrentRetry.json();
  assert.equal(firstBody.ticketId, retryBody.ticketId);
  assert.equal(records.size, 1);

  const conflict = await handler(supportRequest({ body: "Different content with the same key" }));
  assert.equal(conflict.status, 503);
  assert.equal((await conflict.json()).code, "SUPPORT_CREATE_FAILED");
  assert.equal(records.size, 1);
});

test("F-009 topic policy accepts only known topics and derives fixed priorities", () => {
  assert.equal(normalizeSupportTopic("Delivery order"), "delivery");
  assert.equal(normalizeSupportTopic("wallet"), "wallet");
  assert.equal(normalizeSupportTopic("not-a-topic"), null);
  assert.equal(normalizeSupportSource("form"), "form");
  assert.equal(normalizeSupportSource("widget"), "widget");
  assert.equal(normalizeSupportSource("admin"), null);
  assert.equal(supportTopics.delivery.priority, "high");
  assert.equal(supportTopics.wallet.priority, "urgent");
  assert.equal(supportTopics.business.priority, "normal");
});

test("F-009 uses cryptographically random UUIDv4 idempotency keys", () => {
  const first = newSupportIdempotencyKey();
  const second = newSupportIdempotencyKey();
  assert.equal(isSupportIdempotencyKey(first), true);
  assert.equal(isSupportIdempotencyKey(second), true);
  assert.notEqual(first, second);
  assert.equal(isSupportIdempotencyKey("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(isSupportIdempotencyKey("ticket-id"), false);
});

test("F-009 atomic helper makes exactly one RPC and preserves idempotent results", async () => {
  const calls = [];
  const db = {
    rpc: async (name, values) => {
      calls.push({ name, values });
      return { data: [{ ticket_id: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: false }], error: null };
    }
  };
  const result = await createSupportTicketAtomic(db, {
    idempotencyKey: "132654e6-d6f0-4dc5-a8ab-8a977e701c31",
    userId: "625cead0-98c1-4dae-a5fa-b6a7c6cd9736",
    contactName: "Authenticated User",
    contactEmail: "owner@example.com",
    contactPhone: null,
    topic: "delivery",
    subject: supportTopics.delivery.subject,
    ticketMessage: "A delivery support message",
    priority: supportTopics.delivery.priority,
    customerMessage: "A delivery support message",
    botMessage: supportTopics.delivery.automatedReply
  });
  assert.deepEqual(result, { ticketId: "8ef8a4d0-2f75-4eb7-a668-9574e710ed1f", created: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "create_support_ticket_with_messages");
  assert.equal(calls[0].values.next_priority, "high");
  assert.equal(calls[0].values.next_user_id, "625cead0-98c1-4dae-a5fa-b6a7c6cd9736");
});

test("F-009 atomic helper fails closed on RPC failure", async () => {
  const db = { rpc: async () => ({ data: null, error: { message: "database error" } }) };
  await assert.rejects(
    () => createSupportTicketAtomic(db, {
      idempotencyKey: "132654e6-d6f0-4dc5-a8ab-8a977e701c31",
      userId: null,
      contactName: null,
      contactEmail: null,
      contactPhone: null,
      topic: "other",
      subject: supportTopics.other.subject,
      ticketMessage: "A valid support message",
      priority: supportTopics.other.priority,
      customerMessage: null,
      botMessage: null
    }),
    SupportPersistenceError
  );
});

test("F-009 atomic SQL rolls ticket and initial messages together and deduplicates retries", () => {
  const fn = migration.match(/create or replace function public\.create_support_ticket_with_messages[\s\S]*?\n\$\$;/)?.[0] || "";
  assert.match(fn, /insert into public\.support_tickets/);
  assert.match(fn, /insert into public\.support_messages/);
  assert.match(fn, /on conflict \(idempotency_key\) do nothing/);
  assert.match(fn, /return query select existing_ticket_id, false/);
  assert.ok(fn.indexOf("insert into public.support_tickets") < fn.indexOf("insert into public.support_messages"));
  assert.doesNotMatch(fn, /exception\s+when/i, "The RPC must not swallow an error that should roll back the statement.");
});

test("F-009 requires Turnstile only for anonymous support requests", () => {
  const turnstile = read("lib/support/turnstile.ts");
  const widget = read("components/support/support-turnstile.tsx");
  assert.match(postHandler, /if \(!user\) \{[\s\S]*dependencies\.verifyTurnstile/);
  assert.match(turnstile, /TURNSTILE_SECRET_KEY/);
  assert.match(turnstile, /challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
  assert.match(turnstile, /payload\.set\("response", input\.token\)/);
  assert.match(turnstile, /payload\.set\("idempotency_key", input\.idempotencyKey\)/);
  assert.match(turnstile, /result\.action !== SUPPORT_TURNSTILE_ACTION/);
  assert.match(turnstile, /!isLocalTurnstileHostname\(expectedHostname\) && result\.hostname\?\.toLowerCase\(\) !== expectedHostname/);
  assert.match(widget, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.doesNotMatch(widget, /TURNSTILE_SECRET_KEY/);
});

test("F-009 Turnstile behavior validates action and hostname with a mocked Siteverify response", async () => {
  let submitted;
  const valid = await verifySupportTurnstile({
    token: "valid-token",
    remoteIp: "203.0.113.10",
    idempotencyKey: requestKey,
    expectedHostname: "fastfleets.example",
    secret: "server-secret",
    fetcher: async (_url, init) => {
      submitted = init.body;
      return Response.json({ success: true, action: "support_submit", hostname: "fastfleets.example" });
    }
  });
  assert.deepEqual(valid, { ok: true });
  assert.equal(submitted.get("secret"), "server-secret");
  assert.equal(submitted.get("response"), "valid-token");
  assert.equal(submitted.get("remoteip"), "203.0.113.10");
  assert.equal(submitted.get("idempotency_key"), requestKey);

  const invalidAction = await verifySupportTurnstile({
    token: "valid-token",
    idempotencyKey: requestKey,
    expectedHostname: "fastfleets.example",
    secret: "server-secret",
    fetcher: async () => Response.json({ success: true, action: "other_action", hostname: "fastfleets.example" })
  });
  assert.deepEqual(invalidAction, { ok: false, code: "TURNSTILE_INVALID" });

  const invalidHostname = await verifySupportTurnstile({
    token: "valid-token",
    idempotencyKey: requestKey,
    expectedHostname: "fastfleets.example",
    secret: "server-secret",
    fetcher: async () => Response.json({ success: true, action: "support_submit", hostname: "attacker.example" })
  });
  assert.deepEqual(invalidHostname, { ok: false, code: "TURNSTILE_INVALID" });
});

test("F-009 support IP detection ignores spoofable forwarding headers", () => {
  const request = new Request("https://fastfleets.example/api/support", {
    headers: {
      "x-forwarded-for": "192.0.2.99",
      "x-real-ip": "192.0.2.98",
      "x-vercel-forwarded-for": "203.0.113.10",
      "cf-connecting-ip": "198.51.100.20"
    }
  });
  assert.equal(supportClientIp(request, { VERCEL: "1" }), "203.0.113.10");
  assert.equal(supportClientIp(request, { SUPPORT_TRUSTED_PROXY: "cloudflare" }), "198.51.100.20");
  assert.equal(supportClientIp(request, {}), "unknown-ip");

  const spoofedChain = new Request("https://fastfleets.example/api/support", {
    headers: { "x-vercel-forwarded-for": "203.0.113.10, 192.0.2.99", "x-forwarded-for": "203.0.113.10" }
  });
  assert.equal(supportClientIp(spoofedChain, { VERCEL: "1" }), "unknown-ip");
});

test("F-009 admin replies derive admin sender identity and remain bounded", () => {
  const adminRoute = read("app/api/admin/risk-signals/route.ts");
  assert.match(adminRoute, /const trustedAdmin = await requireAdminSession\(request\)/);
  assert.match(adminRoute, /sender_type: "admin"/);
  assert.match(adminRoute, /sender_user_id: trustedAdmin\.userId/);
  assert.match(adminRoute, /reply\.length < 2 \|\| reply\.length > 2_000/);
});

test("F-009 intentionally adds no anonymous follow-up, notifications, or out-of-scope business logic", () => {
  assert.doesNotMatch(route, /export async function (?:GET|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(`${route}\n${postHandler}`, /notifications|push|email notification/i);
  assert.doesNotMatch(migration, /wallet|commission|squad|payment_intent|rider_jobs|accept_delivery|pricing_rules|marketplace/i);
  assert.match(read("security-remediation/03-support-authorization-remediation.md"), /Anonymous follow-up is intentionally unsupported/);
});

const STAGING_CONFIRM_VALUE = "I_UNDERSTAND_THIS_IS_STAGING";
const KNOWN_PRODUCTION_SUPABASE_URLS = new Set(["https://jenvnpfdeztpayskqeeq.supabase.co"]);
const stagingEnabled = process.env.F009_STAGING_ENABLE === "1";
const stagingUrl = process.env.F009_STAGING_SUPABASE_URL;
const productionUrl = process.env.F009_PRODUCTION_SUPABASE_URL;
const stagingAnonKey = process.env.F009_STAGING_SUPABASE_ANON_KEY;
const stagingServiceRoleKey = process.env.F009_STAGING_SUPABASE_SERVICE_ROLE_KEY;

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function stagingSkip() {
  if (!stagingEnabled) return "Skipped until F009_STAGING_ENABLE=1 is explicitly provided.";
  const required = [
    "F009_STAGING_CONFIRM",
    "F009_STAGING_SUPABASE_URL",
    "F009_PRODUCTION_SUPABASE_URL",
    "F009_STAGING_SUPABASE_ANON_KEY",
    "F009_STAGING_SUPABASE_SERVICE_ROLE_KEY",
    "F009_STAGING_OWNER_EMAIL",
    "F009_STAGING_OWNER_PASSWORD",
    "F009_STAGING_OTHER_EMAIL",
    "F009_STAGING_OTHER_PASSWORD",
    "F009_STAGING_ADMIN_EMAIL",
    "F009_STAGING_ADMIN_PASSWORD"
  ];
  const missing = required.filter((name) => !process.env[name]);
  return missing.length ? `Skipped until explicit staging env is provided: ${missing.join(", ")}` : false;
}

function stagingClient(key = stagingAnonKey) {
  return createClient(stagingUrl, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function signIn(emailName, passwordName) {
  const client = stagingClient();
  const { data, error } = await client.auth.signInWithPassword({ email: process.env[emailName], password: process.env[passwordName] });
  assert.ifError(error);
  assert.ok(data.user?.id);
  return { client, userId: data.user.id };
}

test("F-009 staging RLS verifies owner/admin isolation, browser denial, UUID abuse, idempotency, and rollback", { skip: stagingSkip() }, async () => {
  assert.equal(process.env.F009_STAGING_CONFIRM, STAGING_CONFIRM_VALUE);
  assert.match(String(stagingUrl), /^https:\/\/.+\.supabase\.co$/i);
  assert.notEqual(normalizeUrl(stagingUrl), normalizeUrl(productionUrl));
  assert.ok(!KNOWN_PRODUCTION_SUPABASE_URLS.has(normalizeUrl(stagingUrl)));

  const service = stagingClient(stagingServiceRoleKey);
  const markerKey = process.env.F009_STAGING_MARKER_KEY || "f009_staging_validation_marker";
  const { data: marker, error: markerError } = await service.from("platform_settings").select("value").eq("key", markerKey).maybeSingle();
  assert.ifError(markerError);
  assert.equal(marker?.value?.environment, "staging");
  assert.equal(marker?.value?.allow_f009_tests, true);

  const owner = await signIn("F009_STAGING_OWNER_EMAIL", "F009_STAGING_OWNER_PASSWORD");
  const other = await signIn("F009_STAGING_OTHER_EMAIL", "F009_STAGING_OTHER_PASSWORD");
  const admin = await signIn("F009_STAGING_ADMIN_EMAIL", "F009_STAGING_ADMIN_PASSWORD");
  const adminProfile = await service.from("profiles").select("is_admin").eq("user_id", admin.userId).maybeSingle();
  assert.ifError(adminProfile.error);
  assert.equal(adminProfile.data?.is_admin, true);

  const key = crypto.randomUUID();
  const concurrentKey = crypto.randomUUID();
  const rollbackKey = crypto.randomUUID();
  try {
    const first = await service.rpc("create_support_ticket_with_messages", {
      next_idempotency_key: key,
      next_user_id: owner.userId,
      next_contact_name: "F009 Owner",
      next_contact_email: process.env.F009_STAGING_OWNER_EMAIL,
      next_contact_phone: null,
      next_topic: "other",
      next_subject: "F009 staging authorization test",
      next_ticket_message: "F009 staging owner isolation message",
      next_priority: "normal",
      next_customer_message: "F009 staging owner isolation message",
      next_bot_message: "F009 staging automated reply"
    });
    assert.ifError(first.error);
    const firstRow = Array.isArray(first.data) ? first.data[0] : first.data;
    assert.ok(firstRow?.ticket_id);
    assert.equal(firstRow.created, true);

    const retry = await service.rpc("create_support_ticket_with_messages", {
      next_idempotency_key: key,
      next_user_id: owner.userId,
      next_contact_name: "F009 Owner",
      next_contact_email: process.env.F009_STAGING_OWNER_EMAIL,
      next_contact_phone: null,
      next_topic: "other",
      next_subject: "F009 staging authorization test",
      next_ticket_message: "F009 staging owner isolation message",
      next_priority: "normal",
      next_customer_message: "F009 staging owner isolation message",
      next_bot_message: "F009 staging automated reply"
    });
    assert.ifError(retry.error);
    const retryRow = Array.isArray(retry.data) ? retry.data[0] : retry.data;
    assert.equal(retryRow?.ticket_id, firstRow.ticket_id);
    assert.equal(retryRow?.created, false);

    const concurrentInput = {
      next_idempotency_key: concurrentKey,
      next_user_id: owner.userId,
      next_contact_name: "F009 Owner",
      next_contact_email: process.env.F009_STAGING_OWNER_EMAIL,
      next_contact_phone: null,
      next_topic: "other",
      next_subject: "F009 concurrent staging test",
      next_ticket_message: "F009 concurrent idempotency message",
      next_priority: "normal",
      next_customer_message: "F009 concurrent idempotency message",
      next_bot_message: "F009 concurrent automated reply"
    };
    const concurrent = await Promise.all([
      service.rpc("create_support_ticket_with_messages", concurrentInput),
      service.rpc("create_support_ticket_with_messages", concurrentInput)
    ]);
    concurrent.forEach((result) => assert.ifError(result.error));
    const concurrentRows = concurrent.map((result) => (Array.isArray(result.data) ? result.data[0] : result.data));
    assert.equal(concurrentRows[0]?.ticket_id, concurrentRows[1]?.ticket_id);
    assert.deepEqual(concurrentRows.map((row) => row?.created).sort(), [false, true]);

    const conflictingReuse = await service.rpc("create_support_ticket_with_messages", {
      ...concurrentInput,
      next_ticket_message: "Conflicting content for an existing idempotency key",
      next_customer_message: "Conflicting content for an existing idempotency key"
    });
    assert.ok(conflictingReuse.error);
    const conflictingRows = await service.from("support_tickets").select("id").eq("idempotency_key", concurrentKey);
    assert.ifError(conflictingRows.error);
    assert.equal(conflictingRows.data?.length, 1);

    const anonymousInsert = await stagingClient().from("support_tickets").insert({ topic: "other", message: "Anonymous direct browser insert" });
    assert.ok(anonymousInsert.error);
    const ownerInsert = await owner.client.from("support_tickets").insert({ user_id: other.userId, topic: "other", message: "Spoofed direct browser insert" });
    assert.ok(ownerInsert.error);
    const crossTicketMessage = await other.client.from("support_messages").insert({ ticket_id: firstRow.ticket_id, sender_type: "admin", body: "UUID abuse" });
    assert.ok(crossTicketMessage.error);
    const ownerStatusUpdate = await owner.client.from("support_tickets").update({ status: "closed", priority: "urgent", assigned_admin_id: admin.userId, admin_notes: "spoof" }).eq("id", firstRow.ticket_id);
    assert.ok(ownerStatusUpdate.error);

    const ownerRead = await owner.client.from("support_tickets").select("id").eq("id", firstRow.ticket_id);
    assert.ifError(ownerRead.error);
    assert.equal(ownerRead.data?.length, 1);
    const ownerInternalTicketRead = await owner.client
      .from("support_tickets")
      .select("id, admin_notes, assigned_admin_id, idempotency_key")
      .eq("id", firstRow.ticket_id);
    assert.ok(ownerInternalTicketRead.error);
    const otherRead = await other.client.from("support_tickets").select("id").eq("id", firstRow.ticket_id);
    assert.ifError(otherRead.error);
    assert.equal(otherRead.data?.length, 0);
    const adminRead = await admin.client.from("support_tickets").select("id").eq("id", firstRow.ticket_id);
    assert.ifError(adminRead.error);
    assert.equal(adminRead.data?.length, 0);
    const ownerMessages = await owner.client.from("support_messages").select("id, sender_type").eq("ticket_id", firstRow.ticket_id);
    assert.ifError(ownerMessages.error);
    assert.equal(ownerMessages.data?.length, 2);
    const ownerAdminIdentityRead = await owner.client.from("support_messages").select("id, sender_user_id").eq("ticket_id", firstRow.ticket_id);
    assert.ok(ownerAdminIdentityRead.error);
    const otherMessages = await other.client.from("support_messages").select("id").eq("ticket_id", firstRow.ticket_id);
    assert.ifError(otherMessages.error);
    assert.equal(otherMessages.data?.length, 0);
    const adminMessages = await admin.client.from("support_messages").select("id").eq("ticket_id", firstRow.ticket_id);
    assert.ifError(adminMessages.error);
    assert.equal(adminMessages.data?.length, 0);
    const adminDirectUpdate = await admin.client.from("support_tickets").update({ status: "closed" }).eq("id", firstRow.ticket_id);
    assert.ok(adminDirectUpdate.error);

    const rollback = await service.rpc("create_support_ticket_with_messages", {
      next_idempotency_key: rollbackKey,
      next_user_id: owner.userId,
      next_contact_name: "F009 Owner",
      next_contact_email: process.env.F009_STAGING_OWNER_EMAIL,
      next_contact_phone: null,
      next_topic: "other",
      next_subject: "F009 rollback test",
      next_ticket_message: "F009 rollback must leave no ticket",
      next_priority: "normal",
      next_customer_message: "F009 rollback must leave no ticket",
      next_bot_message: "x"
    });
    assert.ok(rollback.error);
    const orphan = await service.from("support_tickets").select("id").eq("idempotency_key", rollbackKey);
    assert.ifError(orphan.error);
    assert.equal(orphan.data?.length, 0);
  } finally {
    await service.from("support_tickets").delete().in("idempotency_key", [key, concurrentKey, rollbackKey]);
  }
});
