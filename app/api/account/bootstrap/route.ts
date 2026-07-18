import { NextResponse } from "next/server";
import { parseSelfServiceRole } from "@/lib/auth/roles";
import { normalizeState } from "@/lib/launch-states";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

  const limited = await enforceRateLimit(request, rateLimitPolicies.authSensitive);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const role = parseSelfServiceRole(body.role);
  if (!role) return NextResponse.json({ error: "Choose a valid account type." }, { status: 400 });

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure account setup is temporarily unavailable." }, { status: 503 });

  const state = role === "customer" ? normalizeState(clean(body.state, 80)) || "Lagos" : "Lagos";
  const fullName = clean(body.fullName, 120) || metadataName(user.user_metadata) || user.email?.split("@")[0] || "Fast Fleets 360 user";
  const avatarUrl = clean(body.avatarUrl, 1000) || null;
  const now = new Date().toISOString();

  const metadataResult = await supabase.auth.updateUser({
    data: { account_type: role, role, default_zone: state, state: role === "customer" ? state : undefined }
  });
  if (metadataResult.error) return NextResponse.json({ error: "Could not complete account setup." }, { status: 503 });

  const writes = await Promise.all([
    db.from("users").upsert({
      id: user.id,
      full_name: fullName,
      phone: user.phone || null,
      email: user.email || null,
      avatar_url: avatarUrl,
      role,
      default_zone: state,
      updated_at: now
    }),
    db.from("profiles").upsert({
      id: user.id,
      user_id: user.id,
      full_name: fullName,
      phone: user.phone || null,
      email: user.email || null,
      avatar_url: avatarUrl,
      account_type: role,
      lga: state,
      updated_at: now
    })
  ]);
  if (writes.some((result) => result.error)) {
    return NextResponse.json({ error: "Could not complete account setup." }, { status: 503 });
  }

  return NextResponse.json({ ok: true, role, state, fullName });
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function metadataName(metadata: Record<string, unknown> | undefined) {
  return clean(metadata?.full_name, 120) || clean(metadata?.name, 120);
}
