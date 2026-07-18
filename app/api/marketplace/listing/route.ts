import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { businessCommissionRate } from "@/lib/business-commission";
import { canRetryMarketplaceListing } from "@/lib/marketplace-listing";
import { sendMarketplaceListingRequestEmail } from "@/lib/marketplace-listing-email";
import { parseSelfServiceRole, parseUserRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const listingSelect =
  "id, business_profile_id, user_id, store_name, store_category, commission_rate, item_count, expected_average_orders, contact_email, whatsapp_number, status, rejection_reason, reviewed_by, reviewed_at, retry_after, created_at, updated_at";

type BusinessProfileRow = {
  id: string;
  user_id: string;
  business_name?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  email?: string | null;
  industry?: string | null;
  business_type?: string | null;
  commission_rate?: number | string | null;
  registration_status?: string | null;
};

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to open Marketplace Listing." }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("user_id", user.id)
      .maybeSingle<{ account_type?: string | null }>();
    const role = parseUserRole(profile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
    if (role !== "business") return NextResponse.json({ role, business: null, application: null });

    const db = createAdminClient() || supabase;
    const business = await loadBusinessProfile(db, user.id);
    const application = business?.id ? await loadLatestApplication(db, business.id) : null;

    return NextResponse.json({
      role,
      business,
      application
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load marketplace listing status." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before applying for Marketplace Listing." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.marketplaceProductWrite);
    if (limited) return limited;

    const { data: accountProfile } = await supabase
      .from("profiles")
      .select("account_type")
      .eq("user_id", user.id)
      .maybeSingle<{ account_type?: string | null }>();
    const role = parseUserRole(accountProfile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
    if (role !== "business") {
      return NextResponse.json({ error: "Ineligible to non-business account users." }, { status: 403 });
    }

    const db = createAdminClient() || supabase;
    const business = await loadBusinessProfile(db, user.id);
    if (!business?.id || business.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before applying for Marketplace Listing." }, { status: 403 });
    }

    const latest = await loadLatestApplication(db, business.id);
    if (latest?.status === "submitted") {
      return NextResponse.json({ error: "Your Marketplace Listing request is already under review.", application: latest }, { status: 409 });
    }
    if (latest?.status === "accepted") {
      return NextResponse.json({ error: "Your Marketplace Listing request has already been accepted.", application: latest }, { status: 409 });
    }
    if (latest?.status === "rejected" && !canRetryMarketplaceListing(latest)) {
      return NextResponse.json({ error: "You can try again after the retry window ends.", application: latest }, { status: 409 });
    }

    const storeName = clean(body.store_name, 140) || clean(body.storeName, 140) || business.business_name || "";
    const storeCategory = clean(body.store_category, 90) || clean(body.storeCategory, 90) || business.business_type || business.industry || "";
    const itemCount = Number(body.item_count || body.itemCount);
    const expectedAverageOrders = clean(body.expected_average_orders, 160) || clean(body.expectedAverageOrders, 160);
    const contactEmail = clean(body.contact_email, 180) || clean(body.contactEmail, 180) || business.email || user.email || "";
    const whatsappNumber = clean(body.whatsapp_number, 40) || clean(body.whatsappNumber, 40) || business.phone || "";
    const commissionRate = businessCommissionRate(business.business_type || business.industry);

    if (storeName.length < 2) return NextResponse.json({ error: "Enter the store name." }, { status: 400 });
    if (storeCategory.length < 2) return NextResponse.json({ error: "Enter the store category." }, { status: 400 });
    if (!Number.isInteger(itemCount) || itemCount < 5 || itemCount > 15) {
      return NextResponse.json({ error: "Number of items must be between 5 and 15." }, { status: 400 });
    }
    if (expectedAverageOrders.length < 1) return NextResponse.json({ error: "Enter expected average orders." }, { status: 400 });
    if (!contactEmail.includes("@")) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    if (whatsappNumber.replace(/\D/g, "").length < 7) return NextResponse.json({ error: "Enter a valid WhatsApp number." }, { status: 400 });

    const { data: application, error } = await db
      .from("marketplace_listing_applications")
      .insert({
        business_profile_id: business.id,
        user_id: user.id,
        store_name: storeName,
        store_category: storeCategory,
        commission_rate: commissionRate,
        item_count: itemCount,
        expected_average_orders: expectedAverageOrders,
        contact_email: contactEmail,
        whatsapp_number: whatsappNumber,
        status: "submitted"
      })
      .select(listingSelect)
      .single();
    if (error) throw error;

    const emailResult = await sendMarketplaceListingRequestEmail({
      storeName,
      storeCategory,
      commissionRate,
      itemCount,
      expectedAverageOrders,
      contactEmail,
      whatsappNumber,
      businessName: business.business_name || storeName,
      businessProfileId: business.id,
      applicationId: application.id
    }).catch((emailError) => ({ sent: false, reason: emailError instanceof Error ? emailError.message : "Email failed." }));

    await db.from("notifications").insert({
      user_id: user.id,
      title: "Marketplace listing request submitted",
      body: "Your application is under review. Fast Fleets 360 will contact you by email or WhatsApp.",
      type: "marketplace_listing_application",
      channel: "in_app",
      metadata: { application_id: application.id, email_sent: emailResult.sent }
    });

    return NextResponse.json({ application, emailSent: emailResult.sent });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not submit Marketplace Listing request." }, { status: 500 });
  }
}

async function loadBusinessProfile(db: SupabaseClient, userId: string) {
  const { data, error } = await db
    .from("business_profiles")
    .select("id, user_id, business_name, contact_name, phone, email, industry, business_type, commission_rate, registration_status")
    .eq("user_id", userId)
    .maybeSingle<BusinessProfileRow>();
  if (error) throw error;
  return data || null;
}

async function loadLatestApplication(db: SupabaseClient, businessProfileId: string) {
  const { data, error } = await db
    .from("marketplace_listing_applications")
    .select(listingSelect)
    .eq("business_profile_id", businessProfileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (error.message?.toLowerCase().includes("marketplace_listing_applications")) return null;
    throw error;
  }
  return data || null;
}

function clean(value: unknown, max = 180) {
  return String(value || "").trim().slice(0, max);
}
