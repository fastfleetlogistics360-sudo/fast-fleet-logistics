import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";

const statuses = new Set(["screening", "assessment_invited", "assessment_passed", "approved", "rider_activated", "rejected", "withdrawn", "suspended"]);

export async function GET() {
  if (!(await requireAdminSession())) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Cyclist operations are not configured." }, { status: 503 });
  const { data, error } = await db.from("cyclist_applications").select("id, user_id, status, can_ride_bicycle, residential_area, preferred_operating_zone, employment_preference, has_smartphone, has_valid_id, has_guarantor, experience_notes, submitted_at, reviewed_at, approved_at, rider_activated_at, rejection_reason, user:users!cyclist_applications_user_id_fkey(full_name, email, phone)").order("created_at", { ascending: false }).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ applications: data || [] });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive");
  if (limited) return limited;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const status = typeof body.status === "string" ? body.status.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!id || !statuses.has(status)) return NextResponse.json({ error: "Choose a cyclist application and a valid status." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Cyclist operations are not configured." }, { status: 503 });
  const { data: application } = await db.from("cyclist_applications").select("id, user_id, referral_id").eq("id", id).maybeSingle<{ id: string; user_id: string; referral_id?: string | null }>();
  if (!application) return NextResponse.json({ error: "Cyclist application not found." }, { status: 404 });
  const rpc = status === "rider_activated"
    ? await db.rpc("activate_cyclist_rider", { target_application_id: id })
    : await db.rpc("transition_cyclist_application", { target_application_id: id, next_status: status, note: reason || null });
  if (rpc.error) return NextResponse.json({ error: rpc.error.message }, { status: 400 });
  const copy = status === "approved" ? "Your cyclist application was approved. Final rider activation is next." : status === "rider_activated" ? "Your rider profile is active. Complete your first delivery to start earning." : status === "rejected" ? `Your cyclist application was not approved: ${reason}` : `Your cyclist application is now ${status.replaceAll("_", " ")}.`;
  void insertNotificationWithPush(db, { user_id: application.user_id, title: "Cyclist application update", body: copy, type: "cyclist_application", metadata: { cyclist_application_id: id, status, url: "/referrals" } }).catch(() => undefined);
  if (status === "approved" && application.referral_id) {
    const { data: referral } = await db.from("referrals").select("referrer_user_id").eq("id", application.referral_id).maybeSingle<{ referrer_user_id?: string | null }>();
    if (referral?.referrer_user_id) void insertNotificationWithPush(db, { user_id: referral.referrer_user_id, title: "Cyclist referral approved", body: "Your cyclist referral was approved. One completed delivery remains to unlock your reward.", type: "referral_cyclist_approved", metadata: { referral_id: application.referral_id, url: "/referrals" } }).catch(() => undefined);
  }
  return NextResponse.json({ ok: true });
}
