import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const conversation = read("lib/automation/conversation.ts");
const route = read("app/api/admin/automation/conversation/route.ts");
const component = read("components/admin/fast-ai-command-centre.tsx");

test("Phase 2B accepts only bounded, internal business questions", () => {
  assert.match(conversation, /message\.length >= 2 && message\.length <= 1200/);
  assert.match(conversation, /ignore \(all \|previous \|prior \)/);
  assert.match(conversation, /cannot follow instructions to expose secrets, execute SQL, or take operational actions/);
  assert.match(conversation, /intent: "clarify"/);
});

test("Phase 2B reuses Phase 2A intelligence and only exposes finance to Super Admin", () => {
  assert.match(conversation, /loadBusinessIntelligence/);
  assert.match(conversation, /const includeFinancial = input\.permission === "super_admin" && intent === "financial"/);
  assert.match(conversation, /No financial data was queried or returned for your role/);
  assert.match(conversation, /compare_reporting_periods/);
  assert.match(conversation, /previousIntent/);
});

test("Phase 2B conversation endpoint is authenticated, server-only, limited, and audited", () => {
  assert.match(route, /requireAdminSession\(request\)/);
  assert.match(route, /enforceRateLimit/);
  assert.match(route, /fastAiConversation/);
  assert.match(route, /automationPermissionFor/);
  assert.match(route, /fast_ai_conversation/);
  assert.match(route, /latency_ms/);
  assert.doesNotMatch(route, /from\("deliveries"\)\.update|payment.*initiat|dispatch/i);
});

test("Phase 2B command centre keeps conversation context client-local and responsive", () => {
  assert.match(component, /Ask FAST AI/);
  assert.match(component, /\/api\/admin\/automation\/conversation/);
  assert.match(component, /Clear conversation/);
  assert.match(component, /Reviewing authorised business data/);
  assert.match(component, /Questions are not stored in the browser after you clear this conversation/);
  assert.match(component, /sm:p-5/);
});

test("Phase 2B has no external provider call or credential dependency", () => {
  assert.doesNotMatch(conversation, /fetch\(|OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY/);
  const provider = read("lib/automation/conversation-provider.ts");
  assert.match(provider, /configuredConversationProvider/);
  assert.match(provider, /reviewed server-only adapter/);
  assert.match(provider, /id: "deterministic"/);
});
