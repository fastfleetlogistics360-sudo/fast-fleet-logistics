import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("proactive FastConfirm cases use a separate service-only atomic RPC", () => {
  const migration = read("security-remediation/migrations/202609280005_care360_proactive_cases.sql");
  assert.match(migration, /^begin;/m);
  assert.match(migration, /create or replace function public\.create_proactive_support_case_atomic/);
  assert.match(migration, /coalesce\(auth\.role\(\), ''\) <> 'service_role'/);
  assert.match(migration, /proactive_incident_key/);
  assert.match(migration, /on conflict \(proactive_incident_key\).*do nothing/s);
  assert.match(migration, /return query select existing_ticket_id, false/);
  assert.match(migration, /insert into public\.support_case_links/);
  assert.match(migration, /'CASE_CREATED'/);
  assert.match(migration, /'PROACTIVE_CASE_CREATED'/);
  assert.match(migration, /revoke all on function public\.create_proactive_support_case_atomic/);
  assert.match(migration, /grant execute.*to service_role/);
  assert.match(migration, /commit;/);
});

test("FastConfirm queues one durable Care360 handoff only after the terminal dispute", () => {
  const hook = read("app/api/customer/pickup-proof/route.ts");
  const handoff = read("security-remediation/migrations/202609280006_care360_proactive_handoffs.sql");
  const cron = read("app/api/cron/care360/route.ts");
  assert.match(hook, /status: "rejected" as const/);
  assert.match(hook, /flagged_at: canContinue \? timestamp/);
  assert.doesNotMatch(hook, /createFastConfirmProactiveCase/);
  assert.match(handoff, /create table if not exists public\.support_proactive_handoffs/);
  assert.match(handoff, /create trigger deliveries_queue_fastconfirm_care360_handoff/);
  assert.match(handoff, /on conflict \(incident_key\) do nothing/);
  assert.match(handoff, /process_support_proactive_handoff/);
  assert.match(handoff, /create_proactive_support_case_atomic/);
  assert.match(handoff, /status = 'pending'.*next_attempt_at = now\(\) \+ interval '5 minutes'/s);
  assert.match(cron, /process_support_proactive_handoff/);
  assert.doesNotMatch(hook, /from\("support_tickets"\)\.insert/);
});

test("ordinary customer atomic creation remains isolated from proactive identity", () => {
  const ordinary = read("security-remediation/migrations/202609280002_support_atomic_case_creation.sql");
  assert.match(ordinary, /create or replace function public\.create_support_case_atomic/);
  assert.doesNotMatch(ordinary, /proactive_incident_key/);
});
