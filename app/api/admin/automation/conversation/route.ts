import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { answerBusinessQuestion, type ConversationContext, validateConversationInput } from "@/lib/automation/conversation";
import { automationPermissionFor } from "@/lib/automation/permissions";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.fastAiConversation);
  if (limited) return limited;
  const permission = await automationPermissionFor(admin.userId);
  if (!permission) return NextResponse.json({ error: "FAST AI permission required." }, { status: 403 });
  const body = await request.json().catch(() => null) as { message?: unknown; context?: ConversationContext } | null;
  const message = validateConversationInput(body?.message);
  if (!message) return NextResponse.json({ error: "Enter a question between 2 and 1,200 characters." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "FAST AI intelligence is unavailable." }, { status: 503 });
  const started = Date.now();
  try {
    const result = await answerBusinessQuestion(db, { message, permission, context: body?.context });
    await db.from("communication_logs").insert({ channel: "website", event_type: "fast_ai_conversation", metadata: { actor_id: admin.userId, role: permission, category: result.intent, tools: result.tools, outcome: "answered", provider: result.provider, latency_ms: Date.now() - started } });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("fast_ai_conversation_failed", { message: error instanceof Error ? error.message : "unknown" });
    await db.from("communication_logs").insert({ channel: "website", event_type: "fast_ai_conversation", metadata: { actor_id: admin.userId, role: permission, outcome: "error", error_category: "intelligence_unavailable", latency_ms: Date.now() - started } });
    return NextResponse.json({ error: "FAST AI could not retrieve verified business intelligence right now." }, { status: 503 });
  }
}
