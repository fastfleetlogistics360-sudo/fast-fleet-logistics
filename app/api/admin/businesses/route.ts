import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

const businessStatuses = new Set(["submitted", "active", "paused", "rejected"]);

const demoBusinesses = [
  {
    id: "BP-1001",
    user_id: "USR-BIZ-1001",
    business_name: "Adewale Stores",
    contact_name: "Adewale Johnson",
    phone: "+2348012345678",
    email: "ops@example.com",
    industry: "Retail and ecommerce",
    business_type: "Grocery",
    commission_rate: 10,
    dispatch_volume: "10 - 30 weekly deliveries",
    pickup_address: "14 Acme Street, Ikeja",
    cac_number: "RC 1234567",
    registration_status: "submitted",
    rejection_reason: null,
    created_at: new Date().toISOString(),
    users: { full_name: "Adewale Johnson", phone: "+2348012345678", email: "ops@example.com" },
    business_documents: [
      { id: "BDOC-1", document_type: "storefront_photo", status: "submitted", file_url: null, storage_path: null, rejection_reason: null },
      { id: "BDOC-2", document_type: "cac_certificate", status: "submitted", file_url: null, storage_path: null, rejection_reason: null }
    ]
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ businesses: demoBusinesses, demo: true });
    return NextResponse.json(missingServiceResponse("admin business KYC"), { status: 503 });
  }

  let { data, error } = await supabase
    .from("business_profiles")
    .select("id, user_id, business_name, contact_name, phone, email, industry, business_type, commission_rate, operating_state, dispatch_volume, pickup_address, cac_number, registration_status, rejection_reason, created_at, updated_at, users:users!business_profiles_user_id_fkey(full_name, phone, email), business_documents(id, document_type, status, file_url, storage_path, rejection_reason, created_at)")
    .order("created_at", { ascending: false })
    .limit(75);

  if (error) {
    const fallback = await supabase
      .from("business_profiles")
      .select("id, user_id, business_name, contact_name, phone, email, industry, dispatch_volume, pickup_address, registration_status, created_at, updated_at, users:users!business_profiles_user_id_fkey(full_name, phone, email)")
      .order("created_at", { ascending: false })
      .limit(75);
    data = fallback.data?.map((business) => ({ ...business, business_type: null, commission_rate: null, operating_state: null, cac_number: null, rejection_reason: null, business_documents: [] })) || null;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ businesses: data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const reason = String(body.reason || "").trim();

  if (!id || !businessStatuses.has(status)) {
    return NextResponse.json({ error: "Choose a business and a valid review status." }, { status: 400 });
  }
  if (status === "rejected" && reason.length < 4) {
    return NextResponse.json({ error: "Add a clear rejection reason for the business." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to review business KYC." }, { status: 503 });
  }

  let { data, error } = await supabase
    .from("business_profiles")
    .update({
      registration_status: status,
      rejection_reason: status === "rejected" ? reason : null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id, user_id, business_name, registration_status, rejection_reason")
    .maybeSingle();

  if (error) {
    const fallback = await supabase
      .from("business_profiles")
      .update({
        registration_status: status,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select("id, user_id, business_name, registration_status")
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, rejection_reason: status === "rejected" ? reason : null } : null;
    error = fallback.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Business KYC request was not found." }, { status: 404 });

  await Promise.allSettled([
    supabase
      .from("profiles")
      .update({ kyc_status: status === "active" ? "approved" : status === "rejected" ? "rejected" : "pending_review", updated_at: new Date().toISOString() })
      .eq("user_id", data.user_id),
    insertNotificationWithPush(supabase, {
      user_id: data.user_id,
      title: status === "active" ? "Business KYC approved" : status === "rejected" ? "Business KYC rejected" : "Business KYC updated",
      body: status === "active" ? "Your business account is approved. Dispatch tools are now available." : reason || "Your business KYC status changed.",
      type: "business_kyc",
      metadata: { business_profile_id: data.id, status, url: "/business/dashboard", tag: `ff-business-kyc-${data.id}` }
    })
  ]);

  return NextResponse.json({ business: data });
}
