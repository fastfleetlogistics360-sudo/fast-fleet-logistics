import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { loadBusinessIntelligence, parseIntelligencePeriod } from "@/lib/automation/business-intelligence";
import { automationPermissionFor } from "@/lib/automation/permissions";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const admin = await requireAdminSession();
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.fastAiIntelligenceRead);
  if (limited) return limited;
  const permission = await automationPermissionFor(admin.userId);
  if (!permission) return NextResponse.json({ error: "FAST AI permission required." }, { status: 403 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Business intelligence is unavailable." }, { status: 503 });
  try {
    const periodDays = parseIntelligencePeriod(new URL(request.url).searchParams.get("period"));
    const intelligence = await loadBusinessIntelligence(db, periodDays, { includeFinancial: permission === "super_admin" });
    // Audit only the request metadata; business records and financial values are never copied into logs.
    await db.from("communication_logs").insert({ channel: "website", event_type: "fast_ai_intelligence_read", metadata: { actor_id: admin.userId, period_days: periodDays, mode: "read_only_deterministic" } });
    return NextResponse.json({ ...intelligence, permission, mode: "read_only_deterministic" }, { headers: { "Cache-Control": "private, max-age=60" } });
  } catch (error) {
    console.error("fast_ai_intelligence_load_failed", { message: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "Could not load business intelligence from the approved data sources." }, { status: 503 });
  }
}
