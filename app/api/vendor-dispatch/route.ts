import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const lagosDate = () => {
  const parts = new Intl.DateTimeFormat("en", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
};

async function context() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return { error: "Please sign in to use Vendor Dispatch.", status: 401 as const };
  const db = createAdminClient();
  if (!db) return { error: "Vendor Dispatch is not configured. Add SUPABASE_SERVICE_ROLE_KEY.", status: 503 as const };
  const { data: restaurant, error } = await db.from("business_profiles").select("id, business_name, registration_status").eq("user_id", user.id).maybeSingle<{ id: string; business_name: string; registration_status: string }>();
  if (error || !restaurant) return { error: "Business profile not found.", status: 403 as const };
  return { db, user, restaurant };
}

export async function GET() {
  const current = await context();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const businessDate = lagosDate();
  const [authorization, deliveries, settlement] = await Promise.all([
    current.db.from("vendor_dispatch_authorizations").select("id, authorization_status, assigned_cyclist_id, rider_profiles(id, users:users!rider_profiles_user_id_fkey(full_name))").eq("restaurant_id", current.restaurant.id).maybeSingle(),
    current.db.from("vendor_dispatch_deliveries").select("id, destination, delivery_fee_kobo, business_date, delivery_status, client_submission_id, handoff_code, created_at").eq("restaurant_id", current.restaurant.id).eq("business_date", businessDate).order("created_at", { ascending: false }),
    current.db.from("vendor_dispatch_daily_settlements").select("id, delivery_count, total_delivery_fees_kobo, settlement_status, closed_at").eq("restaurant_id", current.restaurant.id).eq("business_date", businessDate).maybeSingle()
  ]);
  if (authorization.error || deliveries.error || settlement.error) return NextResponse.json({ error: authorization.error?.message || deliveries.error?.message || settlement.error?.message }, { status: 400 });
  const active = authorization.data?.authorization_status === "active" && Boolean(authorization.data.assigned_cyclist_id);
  return NextResponse.json({
    restaurant: { id: current.restaurant.id, name: current.restaurant.business_name }, businessDate,
    authorization: { active, assignedCyclistName: (authorization.data?.rider_profiles as { users?: { full_name?: string | null } | null } | null)?.users?.full_name || null },
    deliveries: deliveries.data || [], settlement: settlement.data || null
  });
}

export async function POST(request: Request) {
  const current = await context();
  if ("error" in current) return NextResponse.json({ error: current.error }, { status: current.status });
  const limited = await enforceRateLimit(request, rateLimitPolicies.businessOrderStatusUpdate);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "");
  if (action === "add") {
    const destination = String(body.destination || "").trim();
    const feeKobo = Math.round(Number(body.deliveryFeeNgn) * 100);
    const clientSubmissionId = String(body.clientSubmissionId || "");
    if (destination.length < 2 || destination.length > 500 || !Number.isSafeInteger(feeKobo) || feeKobo <= 0 || feeKobo > 100_000_000 || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(clientSubmissionId)) return NextResponse.json({ error: "Enter a delivery destination, a positive fee, and a valid submission ID." }, { status: 400 });
    const { data, error } = await current.db.rpc("vendor_dispatch_add_delivery", { p_actor_user_id: current.user.id, p_destination: destination, p_fee_kobo: feeKobo, p_client_submission_id: clientSubmissionId });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    return NextResponse.json({ delivery: data });
  }
  if (action === "close") {
    const businessDate = String(body.businessDate || lagosDate());
    const { data, error } = await current.db.rpc("vendor_dispatch_close_day", { p_actor_user_id: current.user.id, p_business_date: businessDate });
    if (error) return NextResponse.json({ error: error.message }, { status: error.code === "42501" ? 403 : 409 });
    return NextResponse.json({ settlement: data });
  }
  return NextResponse.json({ error: "Unknown Vendor Dispatch action." }, { status: 400 });
}
