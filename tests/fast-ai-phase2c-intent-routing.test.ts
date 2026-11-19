import assert from "node:assert/strict";
import { test } from "node:test";
import { companyKnowledgeIntentFor } from "../lib/automation/company-knowledge.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const customerQuestions = [
  ["What services does Fast Fleets 360 offer?", "company_info"],
  ["How can I send a package in Lagos?", "delivery_request"],
  ["How do I become a delivery partner?", "rider_enquiry"],
  ["How can I register my restaurant?", "vendor_enquiry"],
  ["What if my package is damaged?", "customer_support"],
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
