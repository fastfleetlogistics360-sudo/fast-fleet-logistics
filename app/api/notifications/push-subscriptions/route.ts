import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.pushSubscriptionWrite);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure push registration is temporarily unavailable." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const platform = clean(body.platform) || "web";
  const provider = clean(body.provider) || (platform === "web" ? "web_push" : "fcm");
  const token = clean(body.token) || null;
  const endpoint = clean(body.endpoint) || (token ? `${provider}:${platform}:${token}` : "");
  const deviceId = clean(body.deviceId) || null;
  const keys = body.keys && typeof body.keys === "object" ? body.keys : token ? { token } : null;

  if (!endpoint) return NextResponse.json({ error: "Missing push endpoint or token." }, { status: 400 });

  const now = new Date().toISOString();
  const { data, error } = await db
    .from("push_subscriptions")
    .upsert(
      {
        user_id: user.id,
        endpoint,
        keys,
        platform,
        provider,
        token,
        device_id: deviceId,
        last_seen_at: now,
        updated_at: now
      },
      { onConflict: "endpoint" }
    )
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: "Could not save this push subscription." }, { status: 503 });
  return NextResponse.json({ subscription: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.pushSubscriptionWrite);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure push registration is temporarily unavailable." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const endpoint = clean(body.endpoint);
  const deviceId = clean(body.deviceId);
  let query = db.from("push_subscriptions").delete().eq("user_id", user.id);
  if (endpoint) query = query.eq("endpoint", endpoint);
  else if (deviceId) query = query.eq("device_id", deviceId);
  else return NextResponse.json({ error: "Missing endpoint or device id." }, { status: 400 });

  const { error } = await query;
  if (error) return NextResponse.json({ error: "Could not remove this push subscription." }, { status: 503 });
  return NextResponse.json({ ok: true });
}
