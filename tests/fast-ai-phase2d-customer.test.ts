import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
test("Phase 2D customer engine resolves only from public knowledge and refuses internal data requests", () => {
  const customerEngine = readFileSync(resolve(process.cwd(), "lib/automation/customer-conversation.ts"), "utf8");
  assert.match(customerEngine, /approvedCompanyKnowledge\(intent, message\)/);
  assert.match(customerEngine, /"refuse"\n\s*\);/);
  assert.match(customerEngine, /internal data, access accounts/);
  assert.match(customerEngine, /tools: \[\]/);
});

test("Phase 2D public endpoint is isolated from administrative analytics", () => {
  const customerEngine = readFileSync(resolve(process.cwd(), "lib/automation/customer-conversation.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/fast-ai/conversation/route.ts"), "utf8");
  assert.doesNotMatch(customerEngine, /loadBusinessIntelligence|createAdminClient|SupabaseClient|answerBusinessQuestion/);
  assert.match(customerEngine, /tools: \[\]/);
  assert.match(route, /rateLimitPolicies\.fastAiCustomerConversation/);
  assert.doesNotMatch(route, /admin\/automation\/conversation/);
});

test("Phase 2D persistence is authenticated, owner-scoped, and denies browser message writes", () => {
  const migration = readFileSync(resolve(process.cwd(), "security-remediation/migrations/202611190001_fast_ai_customer_conversations.sql"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/fast-ai/conversation/route.ts"), "utf8");
  assert.match(migration, /create table if not exists public\.assistant_conversations/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /user_id = auth\.uid\(\)/);
  assert.match(migration, /revoke insert, update, delete on public\.assistant_messages from authenticated/);
  assert.match(route, /session\.auth\.getUser\(\)/);
  assert.match(route, /userId: user\.id/);
  assert.match(route, /saveCustomerConversationTurn/);
});

test("Phase 2D customer surface provides the separate public path and navigation entry points", () => {
  const screen = readFileSync(resolve(process.cwd(), "components/fast-ai/customer-fast-ai.tsx"), "utf8");
  const hub = readFileSync(resolve(process.cwd(), "components/hub/quick-action-hub.tsx"), "utf8");
  const dashboard = readFileSync(resolve(process.cwd(), "components/dashboard/customer-dashboard.tsx"), "utf8");
  assert.match(screen, /\/api\/fast-ai\/conversation/);
  assert.match(screen, /Hello! 👋/);
  assert.match(hub, /href: "\/fast-ai"/);
  assert.match(hub, /FastAiLauncher/);
  assert.match(dashboard, /id: "fast-ai", label: "FAST AI"/);
  assert.match(dashboard, /Meet FAST AI/);
  assert.ok(existsSync(resolve(process.cwd(), "public/fast-ai/fast-ai-mascot.jpg")));
  assert.match(readFileSync(resolve(process.cwd(), "components/fast-ai/fast-ai-mascot.tsx"), "utf8"), /fast-ai-mascot\.jpg/);
});
