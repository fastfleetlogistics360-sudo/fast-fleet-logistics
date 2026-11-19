import { NextResponse } from "next/server";
import { answerCustomerIntelligence, type CustomerConversationContext } from "@/lib/automation/customer-intelligence";
import { validateCustomerConversationInput } from "@/lib/automation/customer-conversation";
import { auditCustomerTools, saveCustomerConversationTurn } from "@/lib/automation/customer-conversation-store";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Public, rate-limited FAST AI endpoint. It never delegates to admin FAST AI. */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.fastAiCustomerConversation);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { message?: unknown; conversationId?: unknown; context?: CustomerConversationContext } | null;
  const message = validateCustomerConversationInput(body?.message);
  if (!message) return NextResponse.json({ error: "Enter a question between 2 and 1,200 characters." }, { status: 400 });

  try {
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    const db = createAdminClient();
    const result = await answerCustomerIntelligence({ message, context: validContext(body?.context), userId: user?.id || null, db });
    let conversationId: string | null = null;
    let historySaved = false;
    // Guests remain local-only. Authenticated customers are persisted using a
    // server-derived identity; a client never supplies or selects an owner.
    if (user) {
      if (db) {
        conversationId = await saveCustomerConversationTurn(db, {
          userId: user.id,
          conversationId: typeof body?.conversationId === "string" ? body.conversationId : null,
          question: message,
          answer: result.answer,
          provider: result.provider === "groq" ? "groq" : "deterministic",
          mode: result.mode,
          responseKind: result.responseKind,
          context: result.context
        });
        if (conversationId) await auditCustomerTools(db, { conversationId, userId: user.id, tools: result.tools, intent: result.intent });
        historySaved = true;
      }
    }
    return NextResponse.json({
      answer: result.answer,
      intent: result.intent,
      tools: result.tools,
      provider: result.provider,
      providerModel: result.providerModel,
      mode: result.mode,
      responseKind: result.responseKind,
      context: result.context,
      conversationId,
      historySaved
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "FAST AI is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}

function validContext(value: unknown): CustomerConversationContext | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const allowedIntents = new Set(["general", "company_information", "delivery_enquiry", "delivery_status", "order_status", "restaurant_discovery", "shopping_enquiry", "fast_errand", "rider_operations", "storage_facilities", "heavy_logistics", "customer_support", "vendor_onboarding", "clarify", "refuse"]);
  const previousIntent = typeof record.previousIntent === "string" && allowedIntents.has(record.previousIntent) ? record.previousIntent : undefined;
  const referencedDeliveryCode = typeof record.referencedDeliveryCode === "string" ? record.referencedDeliveryCode.slice(0, 80) : null;
  const referencedOrderCode = typeof record.referencedOrderCode === "string" ? record.referencedOrderCode.slice(0, 80) : null;
  return { previousIntent: previousIntent as CustomerConversationContext["previousIntent"], referencedDeliveryCode, referencedOrderCode };
}
