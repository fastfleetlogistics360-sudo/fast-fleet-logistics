import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ withdrawals: [], demo: true });
  }

  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select(
      "id, amount_ngn, bank_name, account_number, account_name, status, rejection_reason, created_at, reviewed_at, rider_profiles:rider_profiles!withdrawal_requests_rider_profile_id_fkey(id, application_status, vehicle_type, operating_zone, users:users!rider_profiles_user_id_fkey(full_name, phone, email))"
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ withdrawals: data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "");
  const status = String(body.status || "");
  const reason = String(body.reason || "");

  if (!id || !["approved", "rejected", "paid"].includes(status)) {
    return NextResponse.json({ error: "Choose a valid withdrawal and action." }, { status: 400 });
  }
  if (status === "rejected" && reason.trim().length < 4) {
    return NextResponse.json({ error: "Add a clear rejection reason for the driver." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to review withdrawals." }, { status: 503 });
  }

  const { data, error } = await supabase.rpc("review_withdrawal_request", {
    request_id: id,
    next_status: status,
    rejection_note: status === "rejected" ? reason.trim() : null
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, id: data });
}
