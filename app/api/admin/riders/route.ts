import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { RiderApplicationStatus } from "@/types/domain";

const riderStatuses = new Set(["submitted", "under_review", "approved", "rejected", "more_info_required"]);

const demoRiders = [
  {
    id: "RP-1001",
    application_status: "submitted",
    vehicle_type: "bike",
    plate_number: "LSR-428-QA",
    vehicle_color: "Orange",
    operating_zone: "Lekki / VI",
    online: false,
    created_at: new Date().toISOString(),
    users: { full_name: "Amina Yusuf", phone: "+2348012345678", email: "amina@example.com" },
    rider_documents: [
      { id: "DOC-1", document_type: "nin", status: "submitted", file_url: null, rejection_reason: null },
      { id: "DOC-2", document_type: "license", status: "submitted", file_url: null, rejection_reason: null }
    ]
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ riders: demoRiders, demo: true });
  }

  const { data, error } = await supabase
    .from("rider_profiles")
    .select(
      "id, user_id, application_status, vehicle_type, plate_number, vehicle_color, operating_zone, bank_name, account_number, account_name, online, created_at, updated_at, users(full_name, phone, email), rider_documents(id, document_type, status, file_url, storage_path, rejection_reason, created_at)"
    )
    .order("created_at", { ascending: false })
    .limit(75);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ riders: data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const reason = String(body.reason || "").trim();
  const operatingZone = String(body.operatingZone || body.operating_zone || "").trim();

  if (!id || !riderStatuses.has(status)) {
    return NextResponse.json({ error: "Choose a rider and a valid review status." }, { status: 400 });
  }
  if ((status === "rejected" || status === "more_info_required") && reason.length < 4) {
    return NextResponse.json({ error: "Add a clear reason for the rider." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to review riders." }, { status: 503 });
  }

  const patch: {
    application_status: RiderApplicationStatus;
    reviewed_at: string;
    suspension_reason: string | null;
    operating_zone?: string;
  } = {
    application_status: status as RiderApplicationStatus,
    reviewed_at: new Date().toISOString(),
    suspension_reason: status === "rejected" || status === "more_info_required" ? reason : null
  };
  if (operatingZone) patch.operating_zone = operatingZone;

  const { data, error } = await supabase
    .from("rider_profiles")
    .update(patch)
    .eq("id", id)
    .select("id, user_id, application_status, operating_zone, suspension_reason, reviewed_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await Promise.allSettled([
    supabase
      .from("profiles")
      .update({ kyc_status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending_review", updated_at: new Date().toISOString() })
      .eq("user_id", data.user_id),
    supabase
      .from("rider_applications")
      .update({ status, rejection_reason: status === "rejected" || status === "more_info_required" ? reason : null, reviewed_at: new Date().toISOString() })
      .eq("user_id", data.user_id),
    supabase.from("notifications").insert({
      user_id: data.user_id,
      title: status === "approved" ? "Rider KYC approved" : status === "rejected" ? "Rider KYC rejected" : "Rider KYC updated",
      body: status === "approved" ? "Your rider account is approved. You can now go online." : reason || "Your rider application status changed.",
      type: "rider_application",
      channel: "in_app",
      metadata: { rider_profile_id: data.id, status }
    })
  ]);

  return NextResponse.json({ rider: data });
}
