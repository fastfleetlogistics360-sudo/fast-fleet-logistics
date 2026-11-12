import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("FAST AI Phase 1B adds governed management tables with RLS", () => {
  const sql = read("security-remediation/migrations/202611120002_fast_ai_phase1b_governed_management.sql");
  for (const table of ["automation_departments", "marketing_template_versions", "marketing_content_versions"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /alter type public\.marketing_post_status add value if not exists 'revision_requested'/);
  assert.match(sql, /Independent review required/);
  assert.match(sql, /approved_snapshot/);
});

test("FAST AI Phase 1B preserves review state and append-only history", () => {
  const sql = read("security-remediation/migrations/202611120002_fast_ai_phase1b_governed_management.sql");
  assert.match(sql, /revision_requested/);
  assert.match(sql, /insert into public\.marketing_approval_events/);
  assert.match(sql, /marketing_template_versions/);
  assert.match(sql, /marketing_content_versions/);
  assert.match(sql, /Invalid FAST AI post transition/);
});

test("FAST AI Phase 1B server endpoint authorizes writes and never calls providers", () => {
  const route = read("app/api/admin/automation/manage/route.ts");
  assert.match(route, /requireAdminSession\(request\)/);
  assert.match(route, /enforceAdminMutationRateLimit\(request\)/);
  assert.match(route, /hasAutomationPermission/);
  assert.match(route, /transition_marketing_post/);
  assert.doesNotMatch(route, /graph\.facebook\.com|campaigns\.zoho\.com|sendWhatsAppText/);
});

test("FAST AI Phase 1B customer groundwork remains documentation only", () => {
  const contract = read("docs/fast-ai-customer-assistant-contract.md");
  const files = read("components/admin/fast-ai-command-centre.tsx");
  assert.match(contract, /not implemented/);
  assert.match(contract, /current server-side Fast Fleets services/);
  assert.match(files, /does not run AI, publish, send/);
});
