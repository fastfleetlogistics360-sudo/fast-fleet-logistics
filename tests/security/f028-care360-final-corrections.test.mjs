import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("customer case listing is read-only and leaves lifecycle transitions to the scheduled job", () => {
  const list = read("app/api/support/cases/route.ts");
  const cron = read("app/api/cron/care360/route.ts");
  assert.doesNotMatch(list, /from\("support_tickets"\)\.update/);
  assert.doesNotMatch(list, /update\(\{\s*status:\s*["']closed/);
  assert.match(cron, /update\(\{ status: "closed"/);
  assert.match(cron, /authorizeCronRequest/);
});

test("Customer Care queue presents server-derived attention, ownership, priority, SLA, and activity", () => {
  const workspace = read("components/admin/customer-care-workspace.tsx");
  assert.match(workspace, /customerUnread/);
  assert.match(workspace, /Unassigned/);
  assert.match(workspace, /slaState/);
  assert.match(workspace, /last_activity_at/);
  assert.match(workspace, /Reassign to agent/);
  assert.match(workspace, /agents\.map/);
});

test("customer and agent attachment presentation keeps files private while offering compact image and PDF access", () => {
  const customer = read("components/support/case-conversation.tsx");
  const agent = read("components/admin/customer-care-workspace.tsx");
  assert.match(customer, /content_type\?\.startsWith\("image\/"\)/);
  assert.match(customer, /Tap to open PDF/);
  assert.match(customer, /break-all/);
  assert.match(agent, /content_type\?\.startsWith\("image\/"\)/);
  assert.match(agent, /Tap to open/);
  assert.match(agent, /break-all/);
});
