import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const cases = await import("../../lib/support/cases.ts");

test("Phase 1 support lifecycle allows only deliberate transitions", () => {
  assert.equal(cases.canTransitionSupportCase("open", "triaged"), true);
  assert.equal(cases.canTransitionSupportCase("waiting_for_customer", "in_progress"), true);
  assert.equal(cases.canTransitionSupportCase("closed", "in_progress"), true);
  assert.equal(cases.canTransitionSupportCase("closed", "resolved"), false);
});

test("Phase 1 support closure and reopening windows follow approved policy", () => {
  const now = Date.UTC(2026, 8, 26, 12);
  assert.equal(cases.shouldAutoClose(new Date(now - 72 * 60 * 60 * 1000).toISOString(), now), true);
  assert.equal(cases.canCustomerReopen(new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString(), now), true);
  assert.equal(cases.canCustomerReopen(new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), now), false);
});

test("Phase 1 keeps customer case authorization server-side and never uses a case number as authority", () => {
  const listRoute = read("app/api/support/cases/route.ts");
  const detailRoute = read("app/api/support/cases/[id]/route.ts");
  const replyRoute = read("app/api/support/cases/[id]/messages/route.ts");
  assert.match(listRoute, /eq\("user_id", user\.id\)/);
  assert.match(detailRoute, /eq\("id", id\)\.eq\("user_id", user\.id\)/);
  assert.match(replyRoute, /eq\("id", id\)\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(`${listRoute}\n${detailRoute}\n${replyRoute}`, /eq\("case_number"/);
});

test("Phase 1 validates delivery ownership, sends support reply notifications, and removes fake operational tickets", () => {
  const supportRoute = read("app/api/support/route.ts");
  const adminReply = read("app/api/admin/customer-care/cases/[id]/messages/route.ts");
  const legacyQueue = read("app/api/admin/risk-signals/route.ts");
  assert.match(supportRoute, /\.eq\("customer_id", userId\)/);
  assert.match(adminReply, /insertNotificationWithPush/);
  assert.match(adminReply, /url: `\/support\/cases\/\$\{id\}`/);
  assert.doesNotMatch(legacyQueue, /demoSupportTickets|demoRiskSignals|canUseDemoFallback/);
});

test("Phase 1 migration keeps browser writes revoked while adding case fields", () => {
  const sql = read("security-remediation/migrations/202609260001_support_center_phase1.sql");
  assert.match(sql, /case_number/);
  assert.match(sql, /customer_last_read_at/);
  assert.match(sql, /last_activity_at/);
  assert.doesNotMatch(sql, /grant (?:all|insert|update|delete).*authenticated/i);
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.support_/i);
});
