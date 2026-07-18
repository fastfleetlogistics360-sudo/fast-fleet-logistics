import { NextResponse } from "next/server";
import { normalizeState } from "@/lib/launch-states";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const session = await authenticatedSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(request, rateLimitPolicies.accountProfileMutation);
  if (limited) return limited;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const fullName = clean(body.fullName, 120);
  const phone = clean(body.phone, 40);
  const avatarUrl = clean(body.avatarUrl, 1000) || null;
  const state = normalizeState(clean(body.state, 80));
  if (!fullName || !state) return NextResponse.json({ error: "Name and operating state are required." }, { status: 400 });

  const now = new Date().toISOString();
  const updates = await Promise.all([
    session.db.from("profiles").update({ full_name: fullName, phone: phone || null, avatar_url: avatarUrl, lga: state, updated_at: now }).eq("user_id", session.userId),
    session.db.from("users").update({ full_name: fullName, phone: phone || null, avatar_url: avatarUrl, default_zone: state, updated_at: now }).eq("id", session.userId)
  ]);
  if (updates.some((result) => result.error)) return NextResponse.json({ error: "Could not save your profile." }, { status: 503 });
  return NextResponse.json({ ok: true, profile: { full_name: fullName, phone: phone || null, avatar_url: avatarUrl, lga: state, default_zone: state } });
}

export async function POST(request: Request) {
  const session = await authenticatedSession();
  if (session instanceof NextResponse) return session;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action, 40);

  if (action === "address") {
    const limited = await enforceRateLimit(request, rateLimitPolicies.savedAddressMutation);
    if (limited) return limited;
    const label = clean(body.label, 80);
    const address = sanitizeAddressText(clean(body.address, 260));
    if (!label || address.length < 5) return NextResponse.json({ error: "A label and complete address are required." }, { status: 400 });
    const { data, error } = await session.db
      .from("saved_addresses")
      .insert({ user_id: session.userId, label, address })
      .select("id, label, address")
      .single();
    if (error) return NextResponse.json({ error: "Could not save this address." }, { status: 503 });
    return NextResponse.json({ address: data });
  }

  if (action === "waitlist") {
    const limited = await enforceRateLimit(request, rateLimitPolicies.waitlistJoin);
    if (limited) return limited;
    const state = normalizeState(clean(body.state, 80));
    const email = clean(body.email, 180) || session.email;
    const phone = clean(body.phone, 40) || null;
    if (!state || !email) return NextResponse.json({ error: "A valid state and email are required." }, { status: 400 });
    const { error } = await session.db.from("state_waitlist").upsert(
      { user_id: session.userId, state, email, phone, source: "dashboard", status: "waiting", updated_at: new Date().toISOString() },
      { onConflict: "email,state" }
    );
    if (error) return NextResponse.json({ error: "Could not join the waitlist." }, { status: 503 });
    return NextResponse.json({ ok: true, state });
  }

  return NextResponse.json({ error: "Unsupported account action." }, { status: 400 });
}

export async function DELETE(request: Request) {
  const session = await authenticatedSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(request, rateLimitPolicies.savedAddressMutation);
  if (limited) return limited;
  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = clean(body.id, 80);
  if (!id) return NextResponse.json({ error: "Choose an address to delete." }, { status: 400 });
  const { error } = await session.db.from("saved_addresses").delete().eq("id", id).eq("user_id", session.userId);
  if (error) return NextResponse.json({ error: "Could not delete this address." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

async function authenticatedSession() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure account updates are temporarily unavailable." }, { status: 503 });
  return { userId: user.id, email: user.email || "", db };
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
