import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canTransitionPost, immutableApprovalSnapshot } from "../lib/automation/state-machine.ts";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("FAST AI approval state machine rejects shortcuts and terminal transitions", () => {
  assert.equal(canTransitionPost("draft", "reviewed"), true);
  assert.equal(canTransitionPost("reviewed", "approved"), true);
  assert.equal(canTransitionPost("approved", "scheduled"), true);
  assert.equal(canTransitionPost("scheduled", "processing"), true);
  assert.equal(canTransitionPost("processing", "published"), true);
  assert.equal(canTransitionPost("draft", "published"), false);
  assert.equal(canTransitionPost("published", "draft"), false);
  assert.equal(canTransitionPost("cancelled", "scheduled"), false);
});

test("FAST AI approved snapshot is a deep immutable copy", () => {
  const draft = { copy: "Safe launch", media: { url: "/asset.jpg" } };
  const snapshot = immutableApprovalSnapshot(draft);
  draft.media.url = "/changed.jpg";
  assert.deepEqual(snapshot, { copy: "Safe launch", media: { url: "/asset.jpg" } });
});

test("FAST AI migration is server mediated, RLS protected, idempotent and disabled by default", () => {
  const migration = read("security-remediation/migrations/202611120001_fast_ai_phase1a_foundation.sql");
  for (const table of ["publishing_accounts", "marketing_templates", "marketing_campaigns", "marketing_posts", "marketing_approval_events", "marketing_job_outbox", "publishing_logs", "marketing_audience_snapshots", "communication_logs", "provider_webhook_receipts"]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /foundation_enabled boolean not null default false/);
  assert.match(migration, /global_paused boolean not null default true/);
  assert.match(migration, /idempotency_key text not null unique/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /credential_secret_ref text/);
  assert.match(migration, /no OAuth token is stored in this database/);
});

test("FAST AI cron and providers cannot publish in Phase 1A", () => {
  const cron = read("app/api/cron/automation-outbox/route.ts");
  const providers = read("lib/automation/providers.ts");
  assert.match(cron, /disabled_or_paused/);
  assert.match(cron, /provider_adapters_unavailable_in_phase_1a/);
  assert.match(providers, /NOT_CONNECTED/);
  assert.doesNotMatch(providers, /graph\.facebook\.com|campaigns\.zoho\.com/);
});

test("FAST AI administration requires server auth, same-origin request, rate limiting and super admin", () => {
  const route = read("app/api/admin/automation/route.ts");
  assert.match(route, /requireAdminSession\(request\)/);
  assert.match(route, /enforceAdminMutationRateLimit\(request, "destructive"\)/);
  assert.match(route, /hasAutomationPermission\(admin\.userId, "super_admin"\)/);
});
