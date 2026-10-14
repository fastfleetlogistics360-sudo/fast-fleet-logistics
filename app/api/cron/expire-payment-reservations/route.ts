import { NextResponse } from "next/server";
import { authorizeCronRequest } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

/** Server-triggered cleanup; browsers never decide whether a rider is released. */
export async function GET(request: Request) {
  const authorization = authorizeCronRequest(request);
  if (!authorization.authorized) return NextResponse.json({ error: authorization.reason === "misconfigured" ? "Reservation cleanup is not configured." : "Unauthorized." }, { status: authorization.reason === "misconfigured" ? 503 : 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Reservation cleanup is unavailable." }, { status: 503 });
  const { data, error } = await db.rpc("expire_delivery_payment_reservations");
  if (error) return NextResponse.json({ error: "Reservation cleanup failed." }, { status: 500 });
  return NextResponse.json({ expired: Number(data || 0) }, { headers: { "Cache-Control": "no-store" } });
}
