import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Risk and support queues are temporarily unavailable. No demo data is shown." }, { status: 503 });
  }

  const riskResult = await supabase
    .from("fraud_signals")
    .select("id, signal_type, risk_score, details, resolved_at, created_at, users(full_name, email, phone), deliveries(delivery_code, status, price_ngn)")
    .order("created_at", { ascending: false })
    .limit(50);

  if (riskResult.error) return NextResponse.json({ error: riskResult.error.message }, { status: 400 });
  return NextResponse.json({ riskSignals: riskResult.data || [], supportTickets: [] });
}

export async function PATCH(request: Request) {
  const trustedAdmin = await requireAdminSession(request);
  if (!trustedAdmin) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const kind = String(body.kind || "");
  const id = String(body.id || "").trim();

  if (!id || kind !== "risk") {
    return NextResponse.json({ error: "Support cases are managed in Customer Care." }, { status: 400 });
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

}
