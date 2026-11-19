import assert from "node:assert/strict";
import { test } from "node:test";
import { approvedCompanyKnowledge, companyKnowledgeIntentFor } from "../lib/automation/company-knowledge.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const customerQuestions = [
  ["What services does Fast Fleets 360 offer?", "company_info"],
  ["How can I send a package in Lagos?", "delivery_request"],
  ["How do I become a delivery partner?", "rider_enquiry"],
  ["How can I register my restaurant?", "vendor_enquiry"],
  ["What if my package is damaged?", "customer_support"],
  ["How can I report a delayed delivery?", "customer_support"],
  ["My package is late. What should I do?", "customer_support"],
  ["How can I track my package?", "customer_support"],
  ["How can I become a delivery cyclist?", "rider_enquiry"],
  ["What is FastConfirm?", "feature_info"],
  ["How does FastConfirm™ work?", "feature_info"],
  ["What is Secure Hand-Off?", "feature_info"],
  ["How does Secure Handoff work?", "feature_info"],
  ["Do you offer dispatch and package delivery?", "company_info"]
] as const;

test("Phase 2C.1 routes customer-facing questions to approved knowledge without analytics", async () => {
  for (const [message, intent] of customerQuestions) {
    assert.equal(companyKnowledgeIntentFor(message), intent);
  }
  const conversation = readFileSync(resolve(process.cwd(), "lib/automation/conversation.ts"), "utf8");
  assert.match(conversation, /if \(publicMatch\) return \{ intent: publicMatch, periodDays, comparison: false \}/);
  assert.match(conversation, /if \(isCompanyKnowledgeIntent\(parsed\.intent\)\) return answerCompanyKnowledge/);
  assert.ok(conversation.indexOf("if (isCompanyKnowledgeIntent(parsed.intent))") < conversation.indexOf("const current = await loadBusinessIntelligence"));
  assert.match(conversation, /tools: \[\]/);
});

test("Phase 2C.2 feature knowledge accepts trademark and hand-off spelling variants", () => {
  const knowledge = readFileSync(resolve(process.cwd(), "lib/automation/company-knowledge.ts"), "utf8");
  assert.match(knowledge, /FastConfirm™ provides pickup evidence and relevant item details/);
  assert.match(knowledge, /Secure Hand-Off is a final delivery handover confirmation feature/);
  assert.match(knowledge, /fast\\s\*confirm\(\?:™\)\?/);
  assert.match(knowledge, /secure\\s\+hand\(\?:\[-\\s\]\?off\)/);
  assert.equal(approvedCompanyKnowledge("feature_info", "What is FastConfirm™?"), "FastConfirm™ provides pickup evidence and relevant item details after a rider picks up an item, so the customer can confirm the item before the final drop-off.");
  assert.equal(approvedCompanyKnowledge("feature_info", "How does Secure Handoff work?"), "Secure Hand-Off is a final delivery handover confirmation feature that supports confirmation of the completed handover to the recipient.");
});

test("Phase 2C.2 keeps authentication and explicit authorization ahead of parsing, analytics, and Groq", () => {
  const route = readFileSync(resolve(process.cwd(), "app/api/admin/automation/conversation/route.ts"), "utf8");
  const permissions = readFileSync(resolve(process.cwd(), "lib/automation/permissions.ts"), "utf8");
  assert.ok(route.indexOf("const admin = await requireAdminSession(request)") < route.indexOf("await request.json()"));
  assert.ok(route.indexOf("const permission = await automationPermissionFor(admin.userId)") < route.indexOf("await request.json()"));
  assert.match(route, /if \(!permission\) return NextResponse\.json\(\{ error: "FAST AI permission required\." \}, \{ status: 403 \}\)/);
  assert.match(permissions, /return data\?\.role && data\.role in ranks \? data\.role : null/);
  assert.match(route, /requireAdminSession\(request\)/);
  const conversation = readFileSync(resolve(process.cwd(), "lib/automation/conversation.ts"), "utf8");
  assert.match(conversation, /if \(injections\.test\(message\)\) return \{ intent: "refuse"/);
  assert.match(conversation, /const includeFinancial = input\.permission === "super_admin" && intent === "financial"/);
  assert.ok(conversation.indexOf("if (parsed.intent === \"refuse\")") < conversation.indexOf("const current = await loadBusinessIntelligence"));
});

test("Phase 2C.1 fails closed for ambiguous questions and admits only explicit analytics requests", () => {
  const conversation = readFileSync(resolve(process.cwd(), "lib/automation/conversation.ts"), "utf8");
  for (const question of ["How are you?", "How are deliveries going?", "How are things at Fast Fleets 360?"]) {
    assert.equal(companyKnowledgeIntentFor(question), null);
  }
  assert.match(conversation, /if \(!found && !inherited\) return clarification\(periodDays\)/);
  assert.match(conversation, /\["deliveries", \/\\b\(delivery\|deliveries\)\\s\+/);
  assert.match(conversation, /Fail closed: only an explicitly classified analytics intent can reach the loader/);
  assert.ok(conversation.indexOf("if (!isAnalyticsIntent(parsed.intent) && parsed.intent !== \"compare\")") < conversation.indexOf("const current = await loadBusinessIntelligence"));
  assert.ok(conversation.indexOf("if (parsed.intent === \"clarify\")") < conversation.indexOf("const current = await loadBusinessIntelligence"));
  assert.equal(companyKnowledgeIntentFor("Show me delivery statistics"), null);
  assert.equal(companyKnowledgeIntentFor("Show me the company's internal delivery statistics."), null);
});
