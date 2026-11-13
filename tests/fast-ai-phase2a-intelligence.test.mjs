import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Phase 2A intelligence has bounded, deterministic reporting periods", () => {
  const service = read("lib/automation/business-intelligence.ts");
  assert.match(service, /export type IntelligencePeriod = 7 \| 30 \| 90/);
  assert.match(service, /if \(value === "7"\) return 7/);
  assert.match(service, /if \(value === "90"\) return 90/);
  assert.match(service, /return 30/);
  assert.match(service, /limit\(5000\)/);
  assert.match(service, /in\("status", \["searching", "pending_payment"\]\)/);
  assert.doesNotMatch(service, /\["draft", "pending", "assigned", "accepted", "picked_up", "in_transit"\]/);
});

test("Phase 2A keeps financial metrics tied to authoritative records", () => {
  const service = read("lib/automation/business-intelligence.ts");
  assert.match(service, /company_transaction_logs/);
  assert.match(service, /\.eq\("status", "cleared"\)/);
  assert.match(service, /transaction_type === "commission"/);
  assert.match(service, /Delivery fee totals are unavailable/);
  assert.match(service, /Outstanding payments are unavailable/);
  assert.match(service, /const includeFinancial = options\.includeFinancial === true/);
  assert.match(service, /includeFinancial \? db\.from\("transactions"\)/);
});

test("Phase 2A endpoint is server-authenticated, rate-limited, and advisory only", () => {
  const route = read("app/api/admin/automation/intelligence/route.ts");
  assert.match(route, /requireAdminSession/);
  assert.match(route, /enforceRateLimit/);
  assert.match(route, /fastAiIntelligenceRead/);
  assert.match(route, /read_only_deterministic/);
  assert.match(route, /fast_ai_intelligence_read/);
  assert.match(route, /includeFinancial: permission === "super_admin"/);
  assert.doesNotMatch(route, /insert\s+into\s+public\.deliveries|update\s+public\.deliveries|payment.*initiat/i);
});

test("Phase 2A command centre uses real API data and declares unavailable metrics", () => {
  const component = read("components/admin/fast-ai-command-centre.tsx");
  assert.match(component, /Business Intelligence/);
  assert.match(component, /\/api\/admin\/automation\/intelligence\?period=/);
  assert.match(component, /Unavailable or intentionally excluded/);
  assert.match(component, /Deterministic, database-backed reporting/);
});
