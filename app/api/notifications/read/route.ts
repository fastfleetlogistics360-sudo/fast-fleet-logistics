import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.notificationRead);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(body.ids) ? body.ids.filter((value): value is string => typeof value === "string" && value.length <= 80).slice(0, 30) : [];
  if (!ids.length) return NextResponse.json({ error: "Choose at least one notification." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure notification updates are temporarily unavailable." }, { status: 503 });
  const { error } = await db
    .from("notifications")
    .update({ read: true, read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .in("id", ids);
  if (error) return NextResponse.json({ error: "Could not update notifications." }, { status: 503 });
  return NextResponse.json({ ok: true, count: ids.length });
}
