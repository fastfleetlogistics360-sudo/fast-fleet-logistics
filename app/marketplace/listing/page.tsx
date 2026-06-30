import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketplaceListingApplication } from "@/components/marketplace/marketplace-listing-application";
import { BackButton } from "@/components/ui/back-button";
import { parseUserRole } from "@/lib/auth/roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/domain";

export const metadata: Metadata = {
  title: "Marketplace Listing"
};

const listingSelect =
  "id, business_profile_id, user_id, store_name, store_category, commission_rate, item_count, expected_average_orders, contact_email, whatsapp_number, status, rejection_reason, reviewed_by, reviewed_at, retry_after, created_at, updated_at";

export default async function MarketplaceListingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth?returnTo=/marketplace/listing");

  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>(),
    supabase.from("users").select("email").eq("id", user.id).maybeSingle<{ email?: string | null }>()
  ]);
  const role = parseUserRole(profile?.account_type || user.user_metadata?.account_type || user.user_metadata?.role);
  if (!role) redirect("/choose-account-type?returnTo=/marketplace/listing");

  let business = null;
  let application = null;

  if (role === "business") {
    const db = createAdminClient() || supabase;
    let businessResult = await db
      .from("business_profiles")
      .select("id, user_id, business_name, phone, email, industry, business_type, commission_rate, dispatch_volume, registration_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (businessResult.error) {
      businessResult = await db
        .from("business_profiles")
        .select("id, user_id, business_name, phone, email, industry, dispatch_volume, registration_status")
        .eq("user_id", user.id)
        .maybeSingle();
    }
    business = businessResult.data || null;

    if (business?.id) {
      const applicationResult = await db
        .from("marketplace_listing_applications")
        .select(listingSelect)
        .eq("business_profile_id", business.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      application = applicationResult.error ? null : applicationResult.data || null;
    }
  }

  return (
    <>
      <BackButton className="section-wrap pb-4 pt-4" />
      <MarketplaceListingApplication
        role={role as UserRole}
        business={business}
        application={application}
        accountEmail={account?.email || user.email || null}
      />
    </>
  );
}
