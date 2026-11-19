import { NextResponse } from "next/server";
import { answerCustomerQuestion, validateCustomerConversationInput } from "@/lib/automation/customer-conversation";
import { saveCustomerConversationTurn } from "@/lib/automation/customer-conversation-store";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Public, rate-limited FAST AI endpoint. It never delegates to admin FAST AI. */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.fastAiCustomerConversation);
  if (limited) return limited;
  const body = await request.json().catch(() => null) as { message?: unknown; conversationId?: unknown } | null;
  const message = validateCustomerConversationInput(body?.message);
  if (!message) return NextResponse.json({ error: "Enter a question between 2 and 1,200 characters." }, { status: 400 });

  try {
    const result = await answerCustomerQuestion(message);
    const session = await createClient();
    const { data: { user } } = await session.auth.getUser();
    let conversationId: string | null = null;
    let historySaved = false;
    // Guests remain local-only. Authenticated customers are persisted using a
    // server-derived identity; a client never supplies or selects an owner.
    if (user) {
      const db = createAdminClient();
      if (db) {
        conversationId = await saveCustomerConversationTurn(db, {
          userId: user.id,
          conversationId: typeof body?.conversationId === "string" ? body.conversationId : null,
          question: message,
          answer: result.answer,
          provider: result.provider === "groq" ? "groq" : "deterministic",
          mode: result.mode
        });
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
      conversationId,
      historySaved
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "FAST AI is temporarily unavailable. Please try again shortly." }, { status: 503 });
  }
}
