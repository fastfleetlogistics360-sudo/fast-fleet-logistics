import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { defaultLaunchStateRecords, normalizeLaunchStatus, normalizeState } from "@/lib/launch-states";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  const fallback = defaultLaunchStateRecords();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ states: fallback, demo: true });
    return NextResponse.json(missingServiceResponse("launch states"), { status: 503 });
  }

  const [launchResult, waitlistResult] = await Promise.all([
    supabase.from("platform_launch_states").select("state, status, launched_at"),
    supabase.from("state_waitlist").select("state,status")
  ]);

  const waitlistCounts = new Map<string, number>();
  (waitlistResult.data || []).forEach((row) => {
    const state = normalizeState(row.state);
    if (!state || row.status === "launched") return;
    waitlistCounts.set(state, (waitlistCounts.get(state) || 0) + 1);
  });

  const launchRows = new Map((launchResult.data || []).map((row) => [normalizeState(row.state), row]));
  const states = fallback.map((record) => {
    const stored = launchRows.get(record.state);
    return {
      ...record,
      status: stored?.status ? normalizeLaunchStatus(stored.status) : record.status,
      waitlist_count: waitlistCounts.get(record.state) || 0,
      launched_at: stored?.launched_at || record.launched_at
    };
  });

  return NextResponse.json({ states });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const state = normalizeState(String(body.state || ""));
  const status = normalizeLaunchStatus(String(body.status || "active"));
  if (!state) {
    return NextResponse.json({ error: "Choose a valid Nigerian state." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to make state launches live." }, { status: 503 });
  }

  const launchedAt = status === "active" || status === "live" ? new Date().toISOString() : null;
  const { error } = await supabase.from("platform_launch_states").upsert(
    {
      state,
      status,
      launched_at: launchedAt
    },
    { onConflict: "state" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (status === "active" || status === "live") {
    await supabase.from("state_waitlist").update({ status: "launched", updated_at: launchedAt || new Date().toISOString() }).eq("state", state);
  }

  return NextResponse.json({ state, status, launched_at: launchedAt });
}
