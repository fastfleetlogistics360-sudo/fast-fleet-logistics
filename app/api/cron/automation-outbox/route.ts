import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Phase 1A deliberately does not claim or publish jobs until a later phase enables a real provider adapter. */
export async function GET(request: Request) {
  const auth = authorizeCronRequest(request);
  if (!auth.authorized) return NextResponse.json({ error: "Automation cron authorization required." }, { status: auth.reason === "misconfigured" ? 503 : 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Automation foundation is unavailable." }, { status: 503 });
  const { data, error } = await db.from("automation_settings").select("foundation_enabled, global_paused").eq("id", true).maybeSingle<{ foundation_enabled: boolean; global_paused: boolean }>();
  if (error || !data) return NextResponse.json({ error: "Automation foundation has not been migrated." }, { status: 503 });
  if (!data.foundation_enabled || data.global_paused) return NextResponse.json({ ok: true, processed: 0, reason: "disabled_or_paused" }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ok: true, processed: 0, reason: "provider_adapters_unavailable_in_phase_1a" }, { headers: { "Cache-Control": "no-store" } });
}
