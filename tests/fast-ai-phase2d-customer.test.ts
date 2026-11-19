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

test("Phase 3 orchestration keeps live tools ownership-checked and read-only", () => {
  const intelligence = readFileSync(resolve(process.cwd(), "lib/automation/customer-intelligence.ts"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/fast-ai/conversation/route.ts"), "utf8");
  assert.match(intelligence, /export function classifyCustomerIntent/);
  assert.match(intelligence, /CustomerConversationContext/);
  assert.match(intelligence, /\.eq\("customer_id", userId\)/);
  assert.match(intelligence, /get_delivery_status/);
  assert.match(intelligence, /get_order_details/);
  assert.match(intelligence, /from\("orders"\)\.select\("order_code, status, marketplace_kind, updated_at"\)\.eq\("customer_id", userId\)/);
  assert.match(intelligence, /search_restaurants/);
  assert.match(intelligence, /search_products/);
  assert.doesNotMatch(intelligence, /\.insert\(|\.update\(|\.delete\(/);
  assert.match(route, /validContext/);
  assert.match(route, /allowedIntents/);
  assert.match(route, /auditCustomerTools/);
});

test("Phase 3 knowledge is versioned and only authorised operators can update it", () => {
  const migration = readFileSync(resolve(process.cwd(), "security-remediation/migrations/202611190002_fast_ai_knowledge_governance.sql"), "utf8");
  const route = readFileSync(resolve(process.cwd(), "app/api/admin/automation/knowledge/route.ts"), "utf8");
  const intelligence = readFileSync(resolve(process.cwd(), "lib/automation/customer-intelligence.ts"), "utf8");
  assert.match(migration, /fast_ai_knowledge_entries/);
  assert.match(migration, /version integer not null default 1/);
  assert.match(migration, /revoke all on public\.fast_ai_knowledge_entries from anon, authenticated/);
  assert.match(migration, /FastConfirm™/);
  assert.match(migration, /Secure Hand-Off/);
  assert.match(migration, /assistant_conversations add column if not exists context/);
  assert.match(route, /requireAdminSession/);
  assert.match(route, /hasAutomationPermission\(admin\.userId, "operator"\)/);
  assert.match(intelligence, /fast_ai_knowledge_entries/);
  assert.match(intelligence, /status", "published"/);
});
