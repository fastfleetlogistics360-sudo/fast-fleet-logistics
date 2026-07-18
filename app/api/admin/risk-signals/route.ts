import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

const demoRiskSignals = [
  {
    id: "FS-1001",
    signal_type: "payment_mismatch",
    risk_score: 82,
    details: { reason: "Wallet debit did not match delivery amount" },
    resolved_at: null,
    created_at: new Date().toISOString(),
    users: { full_name: "Fast Fleets 360 Customer", email: "customer@example.com", phone: "+2348000000000" },
    deliveries: { delivery_code: "FF-240911-02", status: "pending_payment", price_ngn: 12500 }
  }
];

const demoSupportTickets = [
  {
    id: "ST-1001",
    topic: "refund",
    subject: "Wallet top-up pending",
    message: "Customer says Squad debited them but wallet has not updated.",
    priority: "urgent",
    status: "open",
    contact_name: "Fast Fleets 360 Customer",
    contact_email: "customer@example.com",
    contact_phone: "+2348000000000",
    created_at: new Date().toISOString(),
    support_messages: [
      {
        id: "STM-1001",
        sender_type: "customer",
        body: "Customer says Squad debited them but wallet has not updated.",
        created_at: new Date().toISOString()
      }
    ]
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ riskSignals: demoRiskSignals, supportTickets: demoSupportTickets, demo: true });
    return NextResponse.json(missingServiceResponse("risk and support queues"), { status: 503 });
  }

  const [riskResult, supportResult] = await Promise.all([
    supabase
      .from("fraud_signals")
      .select("id, signal_type, risk_score, details, resolved_at, created_at, users(full_name, email, phone), deliveries(delivery_code, status, price_ngn)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("support_tickets")
      .select("id, topic, subject, message, priority, status, contact_name, contact_email, contact_phone, created_at, updated_at, support_messages(id, sender_type, body, created_at)")
      .order("created_at", { ascending: false })
      .limit(50)
  ]);

  if (riskResult.error) return NextResponse.json({ error: riskResult.error.message }, { status: 400 });
  if (supportResult.error) return NextResponse.json({ error: supportResult.error.message }, { status: 400 });

  return NextResponse.json({ riskSignals: riskResult.data || [], supportTickets: supportResult.data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const id = String(body.id || "").trim();

  if (!id || !["risk", "support", "support_message"].includes(kind)) {
    return NextResponse.json({ error: "Choose a valid risk or support item." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to update risk and support queues." }, { status: 503 });
  }

  if (kind === "risk") {
    const { data, error } = await supabase
      .from("fraud_signals")
      .update({ resolved_at: body.resolved === false ? null : new Date().toISOString() })
      .eq("id", id)
      .select("id, resolved_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ item: data });
  }

  if (kind === "support_message") {
    const reply = String(body.body || "").trim();
    if (reply.length < 2) return NextResponse.json({ error: "Write a reply before sending." }, { status: 400 });
    const { data, error } = await supabase
      .from("support_messages")
      .insert({
        ticket_id: id,
        sender_type: "admin",
        body: reply
      })
      .select("id, sender_type, body, created_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase.from("support_tickets").update({ status: "in_progress" }).eq("id", id);
    return NextResponse.json({ message: data });
  }

  const status = String(body.status || "");
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid support status." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("support_tickets")
    .update({ status: status as "open" | "in_progress" | "resolved" | "closed" })
    .eq("id", id)
    .select("id, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ item: data });
}
