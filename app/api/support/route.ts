import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const priorities = new Set(["normal", "high", "urgent"]);

type SupportRequest = {
  mode?: unknown;
  topic?: unknown;
  subject?: unknown;
  body?: unknown;
  trackingCode?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  priority?: unknown;
  automatedReply?: unknown;
};

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as SupportRequest | null;
  const message = clean(body?.body, 2_000);
  if (message.length < 6) return response({ error: "Add a short message so support knows what to solve.", code: "SUPPORT_MESSAGE_INVALID" }, 400);

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const limited = await enforceRateLimit(request, rateLimitPolicies.supportTicketCreate);
  if (limited) return limited;
  if (body?.mode === "widget") {
    const messageLimit = await enforceRateLimit(request, rateLimitPolicies.supportMessageCreate);
    if (messageLimit) return messageLimit;
  }
  const db = createAdminClient();
  if (!db) return response({ error: "Support is temporarily unavailable. Please try again.", code: "SUPPORT_UNAVAILABLE" }, 503);

  const topic = clean(body?.topic, 80) || "general";
  const priority = priorities.has(clean(body?.priority, 20)) ? clean(body?.priority, 20) : "normal";
  const trackingCode = clean(body?.trackingCode, 80);
  const contactName = clean(body?.name, 120) || textMetadata(user?.user_metadata?.full_name, 120) || null;
  const contactEmail = clean(body?.email, 180) || user?.email || null;
  const contactPhone = clean(body?.phone, 40) || user?.phone || null;
  const subject = clean(body?.subject, 180) || `${topic} support`;
  const ticketMessage = `${message}${trackingCode ? `\nTracking code: ${trackingCode}` : ""}`;

  const { data: ticket, error } = await db
    .from("support_tickets")
    .insert({
      user_id: user?.id || null,
      contact_name: contactName,
      contact_email: contactEmail,
      contact_phone: contactPhone,
      topic,
      subject,
      message: ticketMessage,
      priority,
      status: "open"
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !ticket?.id) return response({ error: "We could not send your request. Please try again.", code: "SUPPORT_CREATE_FAILED" }, 503);

  if (body?.mode === "widget") {
    const automatedReply = clean(body.automatedReply, 1_000) || "Fast Fleets 360 support triage started.";
    const { error: messageError } = await db.from("support_messages").insert([
      { ticket_id: ticket.id, sender_type: "bot", sender_user_id: user?.id || null, body: automatedReply },
      { ticket_id: ticket.id, sender_type: "customer", sender_user_id: user?.id || null, body: message }
    ]);
    if (messageError) return response({ error: "Support received your request, but could not start the conversation.", code: "SUPPORT_MESSAGE_FAILED" }, 503);
  }

  return response({ ticketId: ticket.id }, 201);
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function textMetadata(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
