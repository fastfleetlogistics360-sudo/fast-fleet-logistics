import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import { normalizeRiderAccountType } from "@/lib/rider-account-type";
import type { RiderApplicationStatus } from "@/types/domain";

const riderStatuses = new Set(["pending_review", "submitted", "under_review", "approved", "rejected", "more_info_required"]);

const demoRiders = [
  {
    id: "RP-1001",
    application_status: "submitted",
    rider_account_type: "independent",
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
    if (canUseDemoFallback()) return NextResponse.json({ riders: demoRiders, demo: true });
    return NextResponse.json(missingServiceResponse("admin riders"), { status: 503 });
  }

  await supabase
    .from("rider_profiles")
    .update({ online: false })
    .neq("application_status", "approved")
    .eq("online", true);

  const { data: profileRows, error } = await supabase
    .from("rider_profiles")
    .select(
      "id, user_id, application_status, rider_account_type, vehicle_type, plate_number, vehicle_color, operating_zone, bank_name, account_number, account_name, online, created_at, updated_at, users:users!rider_profiles_user_id_fkey(full_name, phone, email), rider_documents(id, document_type, status, file_url, storage_path, rejection_reason, created_at)"
    )
    .order("created_at", { ascending: false })
    .limit(75);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: applicationRows } = await supabase
    .from("rider_applications")
    .select("id, user_id, status, full_name, phone, email, lga, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, created_at, updated_at, documents")
    .order("created_at", { ascending: false })
    .limit(75);

  const profilesByUser = new Map((profileRows || []).map((profile) => [profile.user_id, profile]));
  const mergedApplications =
    applicationRows?.map((application) => {
      const profile = profilesByUser.get(application.user_id);
      return {
        ...(profile || {}),
        id: profile?.id || application.id,
        application_id: application.id,
        user_id: application.user_id,
        application_status: application.status || profile?.application_status || "pending_review",
        rider_account_type: profile?.rider_account_type || "independent",
        vehicle_type: application.vehicle_type || profile?.vehicle_type || null,
        plate_number: application.plate_number || profile?.plate_number || null,
        vehicle_color: application.vehicle_color || profile?.vehicle_color || null,
        operating_zone: application.lga || profile?.operating_zone || null,
        bank_name: application.bank_name || profile?.bank_name || null,
        account_number: application.account_number || profile?.account_number || null,
        account_name: application.account_name || profile?.account_name || null,
        created_at: application.created_at || profile?.created_at,
        updated_at: application.updated_at || profile?.updated_at,
        users: profile?.users || { full_name: application.full_name, phone: application.phone, email: application.email },
        rider_documents: profile?.rider_documents || documentsFromApplication(application.documents)
      };
    }) || [];

  const applicationUsers = new Set(mergedApplications.map((rider) => rider.user_id));
  const profileOnlyRows = (profileRows || []).filter((profile) => !applicationUsers.has(profile.user_id));

  return NextResponse.json({ riders: [...mergedApplications, ...profileOnlyRows].sort(sortRidersForReview).slice(0, 75) });
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
  const riderAccountType = normalizeRiderAccountType(body.riderAccountType || body.rider_account_type);

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
    rider_account_type?: string;
    operating_zone?: string;
    online?: boolean;
  } = {
    application_status: status as RiderApplicationStatus,
    reviewed_at: new Date().toISOString(),
    suspension_reason: status === "rejected" || status === "more_info_required" ? reason : null
  };
  if (operatingZone) patch.operating_zone = operatingZone;
  if (status === "approved") {
    patch.rider_account_type = riderAccountType;
  }

  const { data, error } = await supabase
    .from("rider_profiles")
    .update(patch)
    .eq("id", id)
    .select("id, user_id, application_status, rider_account_type, operating_zone, suspension_reason, reviewed_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    const applicationPatch = {
      status,
      rejection_reason: status === "rejected" || status === "more_info_required" ? reason : null,
      reviewed_at: new Date().toISOString()
    };
    const { data: application, error: applicationError } = await supabase
      .from("rider_applications")
      .update(applicationPatch)
      .eq("id", id)
      .select("id, user_id, status, full_name, phone, email, lga, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name")
      .maybeSingle();

    if (applicationError) {
      return NextResponse.json({ error: applicationError.message }, { status: 400 });
    }
    if (!application) {
      return NextResponse.json({ error: "Rider application was not found." }, { status: 404 });
    }

    const riderProfile = await ensureRiderProfileFromApplication(supabase, application, status as RiderApplicationStatus, operatingZone, riderAccountType);

    await Promise.allSettled([
      supabase
        .from("profiles")
        .update({ kyc_status: status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending_review", updated_at: new Date().toISOString() })
        .eq("user_id", application.user_id),
      supabase.from("notifications").insert({
        user_id: application.user_id,
        title: status === "approved" ? "Rider KYC approved" : status === "rejected" ? "Rider KYC rejected" : "Rider KYC updated",
        body: status === "approved" ? "Your rider account is approved. You can now go online." : reason || "Your rider application status changed.",
        type: "rider_application",
        channel: "in_app",
        metadata: { rider_application_id: application.id, status }
      })
    ]);

    return NextResponse.json({ rider: { id: riderProfile?.id || application.id, user_id: application.user_id, application_status: application.status, rider_account_type: riderAccountType } });
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

async function ensureRiderProfileFromApplication(
  supabase: NonNullable<ReturnType<typeof createAdminClient>>,
  application: {
    user_id: string;
    status: string;
    lga?: string | null;
    vehicle_type?: string | null;
    plate_number?: string | null;
    vehicle_color?: string | null;
    bank_name?: string | null;
    account_number?: string | null;
    account_name?: string | null;
  },
  status: RiderApplicationStatus,
  operatingZone: string,
  riderAccountType: string
) {
  const { data } = await supabase
    .from("rider_profiles")
    .upsert(
      {
        user_id: application.user_id,
        application_status: status,
        rider_account_type: riderAccountType,
        address: application.lga || operatingZone || null,
        operating_zone: operatingZone || application.lga || null,
        vehicle_type: normalizeDispatchVehicle(application.vehicle_type),
        plate_number: application.plate_number || null,
        vehicle_color: application.vehicle_color || null,
        bank_name: application.bank_name || null,
        account_number: application.account_number || null,
        account_name: application.account_name || null,
        online: false,
        reviewed_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    )
    .select("id")
    .maybeSingle();

  return data;
}

function normalizeDispatchVehicle(vehicleType: string | null | undefined) {
  if (vehicleType === "car" || vehicleType === "van" || vehicleType === "bike") return vehicleType;
  if (vehicleType === "motorcycle" || vehicleType === "tricycle") return "bike";
  return "bike";
}

function documentsFromApplication(documents: unknown) {
  if (!Array.isArray(documents)) return [];
  return documents.map((document, index) => {
    const item = document as { key?: string; url?: string; path?: string };
    return {
      id: `application-doc-${index}`,
      document_type: item.key || "document",
      status: "submitted",
      file_url: item.url || null,
      storage_path: item.path || null,
      rejection_reason: null
    };
  });
}

function sortRidersForReview(a: { application_status?: string | null; updated_at?: string | null; created_at?: string | null }, b: { application_status?: string | null; updated_at?: string | null; created_at?: string | null }) {
  const priority = (status?: string | null) => {
    if (status === "pending_review" || status === "submitted" || status === "under_review" || status === "more_info_required") return 0;
    if (status === "approved") return 1;
    if (status === "rejected") return 2;
    return 3;
  };
  const statusDiff = priority(a.application_status) - priority(b.application_status);
  if (statusDiff) return statusDiff;
  return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime();
}
