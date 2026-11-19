import { approvedCompanyKnowledge, companyKnowledgeIntentFor, type CompanyKnowledgeIntent } from "@/lib/automation/company-knowledge";
import { configuredConversationProvider, generateProviderAnswer, type ConversationProviderId, type ProviderAnswer } from "@/lib/automation/conversation-provider";

export type CustomerConversationIntent = CompanyKnowledgeIntent | "clarify" | "refuse";
export type CustomerConversationResult = {
  answer: string;
  intent: CustomerConversationIntent;
  tools: [];
  provider: ConversationProviderId;
  providerModel: string | null;
  mode: "generative" | "deterministic_fallback";
  providerFailureCategory: ProviderAnswer["failureCategory"] | null;
};

const unsafeRequest = /ignore (all |previous |prior )?(instructions|rules)|system prompt|developer message|reveal.*(secret|key|token|internal|financial|rider statistics)|execute (sql|query|command)|delete |refund|dispatch (a |the )?(delivery|rider)|cancel (a |the )?deliver|initiate (a )?payment/i;

export function validateCustomerConversationInput(value: unknown) {
  if (typeof value !== "string") return null;
  const message = value.trim().replace(/\s+/g, " ");
  // Never persist or send likely secrets/payment credentials to a provider.
  // This is deliberately conservative: FAST AI has no valid need for them.
  if (/\b(api[_ -]?key|password|authorization:\s*bearer|cvv|card number|bank account number)\b/i.test(message)) return null;
  return message.length >= 2 && message.length <= 1_200 ? message : null;
}

/**
 * Customer FAST AI is intentionally isolated from the administrative engine.
 * It imports neither a database client nor business-intelligence helpers.
 */
export async function answerCustomerQuestion(message: string): Promise<CustomerConversationResult> {
  if (unsafeRequest.test(message)) {
    return deterministic(
      "I can help with approved Fast Fleets 360 services, delivery guidance, restaurant and shopping information, and support options. I cannot provide internal data, access accounts, or carry out delivery, payment, or account actions.",
      "refuse"
    );
  }

  const intent = companyKnowledgeIntentFor(message);
  if (!intent) {
    return deterministic(
      "I can help with Fast Fleets 360 services, sending a package, tracking guidance, restaurant or shopping services, FastConfirm™, Secure Hand-Off, vendor registration, cyclist applications, and general support. What would you like to know?",
      "clarify"
    );
  }

  const approvedAnswer = approvedCompanyKnowledge(intent, message);
  const provider = await generateProviderAnswer({
    question: message,
    intelligenceBrief: `Approved public Fast Fleets 360 knowledge:\n${approvedAnswer}`,
    deterministicAnswer: approvedAnswer,
    audience: "customer"
  });
  return {
    answer: provider.answer,
    intent,
    tools: [],
    provider: provider.provider,
    providerModel: provider.provider === "groq" ? configuredConversationProvider().model : null,
    mode: provider.mode,
    providerFailureCategory: provider.failureCategory || null
  };
}

function deterministic(answer: string, intent: CustomerConversationIntent): CustomerConversationResult {
  return { answer, intent, tools: [], provider: "deterministic", providerModel: null, mode: "deterministic_fallback", providerFailureCategory: null };
}
