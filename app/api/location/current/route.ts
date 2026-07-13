import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type LocationPayload = {
  address?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number | null;
  source?: string;
};

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as LocationPayload;
    const latitude = Number(payload.latitude);
    const longitude = Number(payload.longitude);
    const accuracy = payload.accuracy == null ? null : Number(payload.accuracy);

    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      return NextResponse.json({ error: "Valid latitude and longitude are required." }, { status: 400 });
    }
    if (accuracy != null && (!Number.isFinite(accuracy) || accuracy < 0)) {
      return NextResponse.json({ error: "Location accuracy must be a positive number." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: true, saved: false, reason: "signed_out" });

    const db = createAdminClient() || supabase;
    const now = new Date().toISOString();
    const { error } = await db.from("user_locations").upsert(
      {
        user_id: user.id,
        address: clean(payload.address, 500) || null,
        latitude,
        longitude,
        accuracy,
        source: clean(payload.source, 40) || "foreground",
        updated_at: now
      },
      { onConflict: "user_id" }
    );

    if (error) {
      if (isMissingUserLocationsTable(error)) {
        return NextResponse.json({ ok: true, saved: false, reason: "migration_pending" });
      }
      throw error;
    }

    return NextResponse.json({ ok: true, saved: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save current location." }, { status: 500 });
  }
}

function clean(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isMissingUserLocationsTable(error: unknown) {
  const message = String((error as { message?: unknown })?.message || error || "").toLowerCase();
  return message.includes("user_locations") && (message.includes("does not exist") || message.includes("schema cache"));
}
