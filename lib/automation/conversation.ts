import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBusinessIntelligence, type BusinessIntelligence, type IntelligenceMetric, type IntelligencePeriod } from "@/lib/automation/business-intelligence";
import type { AutomationPermission } from "@/lib/automation/permissions";
import { configuredConversationProvider, generateProviderAnswer, type ConversationProviderId, type ProviderAnswer } from "@/lib/automation/conversation-provider";
import { approvedCompanyKnowledge, companyKnowledgeIntentFor, type CompanyKnowledgeIntent } from "@/lib/automation/company-knowledge";

export type ConversationIntent = CompanyKnowledgeIntent | "overview" | "deliveries" | "users" | "riders" | "vendors" | "marketplace" | "financial" | "recommendations" | "compare" | "clarify" | "refuse";
export type ConversationContext = { previousIntent?: ConversationIntent; previousPeriodDays?: IntelligencePeriod };
export type ConversationResult = { answer: string; intent: ConversationIntent; periodDays: IntelligencePeriod; tools: string[]; provider: ConversationProviderId; providerModel: string | null; mode: "generative" | "deterministic_fallback"; providerFailureCategory: ProviderAnswer["failureCategory"] | null; providerValidationFailure: ProviderAnswer["validationFailure"] | null; context: ConversationContext; unavailable: string[] };

const analyticsIntents = new Set<ConversationIntent>(["overview", "deliveries", "users", "riders", "vendors", "marketplace", "financial", "recommendations"]);
const injections = /ignore (all |previous |prior )?(instructions|rules)|system prompt|developer message|reveal.*(secret|key|token)|execute (sql|query|command)|delete |refund|dispatch (a |the )?(delivery|rider)|cancel (a |the )?deliver|initiate (a )?payment/i;

export function validateConversationInput(value: unknown) {
  if (typeof value !== "string") return null;
  const message = value.trim().replace(/\s+/g, " ");
  return message.length >= 2 && message.length <= 1200 ? message : null;
}

export function interpretConversation(message: string, supplied?: ConversationContext): { intent: ConversationIntent; periodDays: IntelligencePeriod; comparison: boolean; clarification?: string } {
  if (injections.test(message)) return { intent: "refuse", periodDays: 30, comparison: false };
  const lower = message.toLowerCase();
  const comparison = /compare|versus|vs\.?|against|previous|prior/.test(lower) || (/\bthat\b/.test(lower) && supplied?.previousIntent !== undefined);
  const periodDays: IntelligencePeriod = /90\s*days?|quarter/.test(lower) ? 90 : /7\s*days?|this week|last week|today|yesterday/.test(lower) ? 7 : 30;
  const publicMatch = companyKnowledgeIntentFor(message);
  if (publicMatch) return { intent: publicMatch, periodDays, comparison: false };
  const explicit: Array<[ConversationIntent, RegExp]> = [
    ["overview", /\b(business|company|operational)\s+(overview|performance|metrics|analytics|report)\b/],
    ["financial", /\b(financial|finance|revenue|income|commission|earning|transaction)\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(financial|finance|revenue|income|commission|earning|transaction)\b/],
    ["deliveries", /\b(delivery|deliveries)\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(delivery|deliveries)\b/],
    ["users", /\b(user|customer|growth|registration)s?\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(users?|customers?|growth|registrations?)\b/],
    ["riders", /\b(rider|driver|fleet|zone|area)s?\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(riders?|drivers?|fleet|zones?|areas?)\b/],
    ["vendors", /\b(vendor|business|onboarding)s?\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(vendors?|businesses|onboarding)\b/],
    ["marketplace", /\b(marketplace|catalogue|catalog|errand|product)s?\s+(statistics|stats|metrics|analytics|performance|report|data)\b|\b(show|give|provide|analyse|analyze|report)\b.*\b(marketplace|catalogue|catalog|errands?|products?)\b/],
    ["recommendations", /\b(prioriti[sz]e|recommend|investigate|management priorities)\b/]
  ];
  const found = explicit.find(([, expression]) => expression.test(lower))?.[0];
  const inherited = comparison && /\b(that|those|them)\b/.test(lower) && supplied?.previousIntent && analyticsIntents.has(supplied.previousIntent) ? supplied.previousIntent : undefined;
  if (!found && !inherited) return clarification(periodDays);
  return { intent: comparison ? "compare" : found || inherited!, periodDays, comparison };
}

const format = (item: IntelligenceMetric) => item.value === null ? "Unavailable" : item.format === "currency" ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(item.value) : item.format === "percent" ? `${item.value.toFixed(1)}%` : item.format === "duration" ? `${item.value.toFixed(0)} minutes` : new Intl.NumberFormat("en-NG", { maximumFractionDigits: 1 }).format(item.value);
const line = (item: IntelligenceMetric) => `${item.label}: ${format(item)}${item.note ? ` (${item.note})` : ""}.`;
const section = (data: BusinessIntelligence, intent: ConversationIntent) => intent === "deliveries" ? data.deliveries : intent === "users" ? data.users : intent === "riders" ? data.riders : intent === "vendors" ? data.vendors : intent === "marketplace" ? data.marketplace : intent === "financial" ? data.financial : data.overview;

export async function answerBusinessQuestion(db: SupabaseClient, input: { message: string; permission: AutomationPermission; context?: ConversationContext }): Promise<ConversationResult> {
  const provider = configuredConversationProvider();
  const parsed = interpretConversation(input.message, input.context);
  if (parsed.intent === "refuse") return { answer: "I can only provide read-only Fast Fleets business intelligence. I cannot follow instructions to expose secrets, execute SQL, or take operational actions.", intent: "refuse", periodDays: parsed.periodDays, tools: [], provider: "deterministic", providerModel: null, mode: "deterministic_fallback", providerFailureCategory: null, providerValidationFailure: null, context: {}, unavailable: [] };
  if (parsed.intent === "clarify") return { answer: parsed.clarification!, intent: "clarify", periodDays: parsed.periodDays, tools: [], provider: "deterministic", providerModel: null, mode: "deterministic_fallback", providerFailureCategory: null, providerValidationFailure: null, context: {}, unavailable: [] };
  if (isCompanyKnowledgeIntent(parsed.intent)) return answerCompanyKnowledge(input.message, parsed.intent, parsed.periodDays);
  // Fail closed: only an explicitly classified analytics intent can reach the loader.
  if (!isAnalyticsIntent(parsed.intent) && parsed.intent !== "compare") return clarificationResult(parsed.periodDays);
  const intent = parsed.intent === "compare" ? (input.context?.previousIntent && analyticsIntents.has(input.context.previousIntent) ? input.context.previousIntent : "overview") : parsed.intent;
  // Query finance only when the authorised Super Admin actually requests it;
  // unrelated questions must not depend on optional financial source health.
  const includeFinancial = input.permission === "super_admin" && intent === "financial";
  const current = await loadBusinessIntelligence(db, parsed.periodDays, { includeFinancial });
  const tools = [toolFor(intent)];
  if (parsed.comparison) {
    const previous = await loadBusinessIntelligence(db, parsed.periodDays, { includeFinancial, asOf: new Date(Date.now() - parsed.periodDays * 86400000) });
    tools.push("compare_reporting_periods");
    const currentMetrics = section(current, intent); const priorMetrics = section(previous, intent);
    const comparisons = currentMetrics.slice(0, 4).map((metric, index) => {
      const before = priorMetrics[index]?.value;
      if (metric.value === null || before === null || before === undefined) return `${metric.label}: unavailable for a verified comparison.`;
      const delta = metric.value - before; const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
      return `${metric.label}: ${format(metric)} (${direction} ${format({ ...metric, value: Math.abs(delta) })} versus the previous ${parsed.periodDays}-day period).`;
    });
    return enrich(response(`Verified comparison: the latest ${parsed.periodDays}-day period is compared with the immediately preceding ${parsed.periodDays}-day period. ${comparisons.join(" ")}`, intent, parsed.periodDays, tools, current, input.permission, provider.id), input.message, current);
  }
  if (intent === "recommendations") {
    const recommendations = current.recommendations.map(item => `${item.title.replace("Recommendation: ", "")}: ${item.recommendation} Evidence: ${item.evidence}`).join(" ");
    return enrich(response(`Management priorities for the last ${parsed.periodDays} days: ${recommendations}`, intent, parsed.periodDays, tools, current, input.permission, provider.id), input.message, current);
  }
  if (intent === "financial" && !includeFinancial) return response("Financial intelligence is restricted to the FAST AI Super Admin role. No financial data was queried or returned for your role.", intent, parsed.periodDays, tools, current, input.permission, provider.id);
  return enrich(response(`Verified ${intent === "overview" ? "business overview" : intent} for the last ${parsed.periodDays} days: ${section(current, intent).map(line).join(" ")}`, intent, parsed.periodDays, tools, current, input.permission, provider.id), input.message, current);
}

function clarification(periodDays: IntelligencePeriod) {
  return { intent: "clarify" as const, periodDays, comparison: false, clarification: "I can help with approved Fast Fleets services, customer support, delivery requests, vendor or rider onboarding, or an explicitly requested internal analytics report." };
}

function clarificationResult(periodDays: IntelligencePeriod): ConversationResult {
  return { answer: clarification(periodDays).clarification, intent: "clarify", periodDays, tools: [], provider: "deterministic", providerModel: null, mode: "deterministic_fallback", providerFailureCategory: null, providerValidationFailure: null, context: {}, unavailable: [] };
}

function isAnalyticsIntent(intent: ConversationIntent) {
  return analyticsIntents.has(intent);
}

function isCompanyKnowledgeIntent(intent: ConversationIntent): intent is CompanyKnowledgeIntent {
  return ["company_info", "customer_support", "delivery_request", "vendor_enquiry", "rider_enquiry"].includes(intent);
}

async function answerCompanyKnowledge(question: string, intent: CompanyKnowledgeIntent, periodDays: IntelligencePeriod): Promise<ConversationResult> {
  const answer = approvedCompanyKnowledge(intent);
  const provider = await generateProviderAnswer({ question, intelligenceBrief: `Approved Fast Fleets 360 company knowledge:\n${answer}`, deterministicAnswer: answer });
  return {
    answer: provider.answer,
    intent,
    periodDays,
    tools: [],
    provider: provider.provider,
    providerModel: provider.provider === "groq" ? configuredConversationProvider().model : null,
    mode: provider.mode,
    providerFailureCategory: provider.failureCategory || null,
    providerValidationFailure: provider.validationFailure || null,
    context: { previousIntent: intent, previousPeriodDays: periodDays },
    unavailable: []
  };
}

function response(answer: string, intent: ConversationIntent, periodDays: IntelligencePeriod, tools: string[], data: BusinessIntelligence, permission: AutomationPermission, provider: ConversationProviderId): ConversationResult {
  return { answer, intent, periodDays, tools, provider, providerModel: null, mode: "deterministic_fallback", providerFailureCategory: null, providerValidationFailure: null, context: { previousIntent: intent, previousPeriodDays: periodDays }, unavailable: permission === "super_admin" ? data.unavailable.filter(item => !item.includes("Super Admin")) : data.unavailable };
}
function toolFor(intent: ConversationIntent) { return ({ deliveries: "get_delivery_metrics", users: "get_user_metrics", riders: "get_rider_metrics", vendors: "get_vendor_metrics", marketplace: "get_marketplace_metrics", financial: "get_financial_metrics", recommendations: "get_business_overview", overview: "get_business_overview" } as Partial<Record<ConversationIntent, string>>)[intent] || "get_business_overview"; }

async function enrich(result: ConversationResult, question: string, data: BusinessIntelligence): Promise<ConversationResult> {
  const metrics = section(data, result.intent).slice(0, 6).map(line).join(" ");
  const brief = [`Reporting period: ${result.periodDays} days.`, `Authorised metrics: ${metrics}`, `Rule-based observations: ${data.insights.slice(0, 3).map(item => `${item.title}: ${item.evidence}`).join(" ") || "None."}`, `Unavailable or excluded: ${result.unavailable.slice(0, 4).join(" ") || "None."}`].join("\n");
  const provider = await generateProviderAnswer({ question, intelligenceBrief: brief.slice(0, 8_000), deterministicAnswer: result.answer });
  return { ...result, answer: provider.answer, provider: provider.provider, providerModel: provider.provider === "groq" ? configuredConversationProvider().model : null, mode: provider.mode, providerFailureCategory: provider.failureCategory || null, providerValidationFailure: provider.validationFailure || null };
}
