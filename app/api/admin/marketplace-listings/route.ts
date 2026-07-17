import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { addBusinessDays } from "@/lib/marketplace-listing";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

const listingSelect =
  "id, business_profile_id, user_id, store_name, store_category, commission_rate, item_count, expected_average_orders, contact_email, whatsapp_number, status, rejection_reason, reviewed_by, reviewed_at, retry_after, created_at, updated_at, business_profiles(id, business_name, business_type, industry, registration_status, users:users!business_profiles_user_id_fkey(full_name, email, phone))";

const demoApplications = [
  {
    id: "MLA-1001",
    business_profile_id: "BP-1001",
    user_id: "USR-BIZ-1001",
    store_name: "Adewale Stores",
    store_category: "Grocery",
    commission_rate: 10,
    item_count: 8,
    expected_average_orders: "20 - 40 weekly orders",
    contact_email: "ops@example.com",
    whatsapp_number: "+2348012345678",
    status: "submitted",
    rejection_reason: null,
    reviewed_by: null,
    reviewed_at: null,
    retry_after: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    business_profiles: {
      id: "BP-1001",
      business_name: "Adewale Stores",
      business_type: "Grocery",
      industry: "Retail and ecommerce",
      registration_status: "active",
      users: { full_name: "Adewale Johnson", phone: "+2348012345678", email: "ops@example.com" }
    }
  }
];

const reviewStatuses = new Set(["accepted", "rejected"]);

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ applications: demoApplications, demo: true });
    return NextResponse.json(missingServiceResponse("admin marketplace listings"), { status: 503 });
  }

  const { data, error } = await supabase
    .from("marketplace_listing_applications")
    .select(listingSelect)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ applications: data || [] });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id || "").trim();
  const status = String(body.status || "").trim();
  const reason = String(body.reason || "").trim();

  if (!id || !reviewStatuses.has(status)) {
    return NextResponse.json({ error: "Choose a marketplace application and a valid review status." }, { status: 400 });
  }
  if (status === "rejected" && reason.length < 4) {
    return NextResponse.json({ error: "Add a clear rejection reason." }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to review marketplace listings." }, { status: 503 });
  }

  const reviewedAt = new Date().toISOString();
  const retryAfter = status === "rejected" ? addBusinessDays(new Date(), 60).toISOString() : null;
  const { data, error } = await supabase
    .from("marketplace_listing_applications")
    .update({
      status,
      rejection_reason: status === "rejected" ? reason : null,
      reviewed_at: reviewedAt,
      retry_after: retryAfter,
      updated_at: reviewedAt
    })
    .eq("id", id)
    .select(listingSelect)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Marketplace listing application was not found." }, { status: 404 });

  await insertNotificationWithPush(supabase, {
    user_id: data.user_id,
    title: status === "accepted" ? "Marketplace application accepted" : "Marketplace application rejected",
    body:
      status === "accepted"
        ? "Your marketplace application was approved. Your business will be published within seven business days."
        : `${reason} You can try again after 60 business days.`,
    type: "marketplace_listing_application",
    metadata: { application_id: data.id, status, retry_after: retryAfter, url: "/business/dashboard", tag: `ff-marketplace-listing-${data.id}` }
  });

  return NextResponse.json({ application: data });
}
