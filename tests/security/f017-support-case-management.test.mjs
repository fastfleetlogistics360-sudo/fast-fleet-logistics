import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");
const management = await import("../../lib/support/management.ts");

test("Phase 2 validates lean queues and persona-bound categories", () => {
  assert.equal(management.isSupportQueue("payments_finance"), true);
  assert.equal(management.isSupportQueue("inventor_support"), false);
  assert.equal(management.validCategory("customer", "delivery", "rider_delayed"), true);
  assert.equal(management.validCategory("customer", "investor", "earnings"), false);
});

test("Phase 2 SLA only consumes staffed Lagos support minutes", () => {
  const afterClose = new Date("2026-09-26T19:30:00.000Z"); // 20:30 WAT
  const due = management.addStaffedMinutes(afterClose, 60);
  assert.equal(due.toISOString(), "2026-09-27T08:00:00.000Z");
  assert.equal(management.slaState(new Date(Date.now() - 1).toISOString()), "breached");
});

test("Phase 2 migration keeps notes/events server-only and non-destructive", () => {
  const sql = read("security-remediation/migrations/202609270001_support_center_phase2_case_management.sql");
  assert.match(sql, /support_case_events/);
  assert.match(sql, /visibility text not null default 'public'/);
  assert.match(sql, /revoke all on public\.support_case_events from authenticated/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.support_/i);
});

test("Phase 2 customer APIs fetch only public messages and admin notes use internal visibility", () => {
  const customerDetail = read("app/api/support/cases/[id]/route.ts");
  const notes = read("app/api/admin/customer-care/cases/[id]/notes/route.ts");
  const adminCase = read("app/api/admin/customer-care/cases/[id]/route.ts");
  assert.match(customerDetail, /\.eq\("visibility", "public"\)/);
  assert.match(notes, /visibility: "internal"/);
  assert.match(notes, /recordSupportEvent/);
  assert.match(adminCase, /validCategory/);
  assert.match(adminCase, /isSupportQueue/);
});
