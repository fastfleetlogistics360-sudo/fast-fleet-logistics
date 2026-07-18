import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function deletedLabel(prefix: string, deletedAt: string) {
  return `${prefix} deleted ${deletedAt.slice(0, 10)}`;
}

async function anonymizeCustomerDeliveries(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, deletedAt: string) {
  const { data } = await admin.from("deliveries").select("id, metadata").eq("customer_id", userId).limit(500);
  await Promise.allSettled(
    (data || []).map((delivery) => {
      const metadata = typeof delivery.metadata === "object" && delivery.metadata ? delivery.metadata : {};
      return admin
        .from("deliveries")
        .update({
          pickup_contact: null,
          dropoff_contact: null,
          metadata: {
            ...metadata,
            account_deleted: true,
            account_deleted_at: deletedAt
          }
        })
        .eq("id", delivery.id);
    })
  );
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Please sign in again before deleting your account." }, { status: 401 });
  }
  const limited = await enforceRateLimit(request, rateLimitPolicies.accountDelete);
  if (limited) return limited;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Account deletion is not configured on this deployment." }, { status: 503 });
  }

  const deletedAt = new Date().toISOString();
  const previousEmail = user.email || null;
  const previousPhone = user.phone || null;
  const anonymizedName = "Deleted account";

  const [{ data: riderProfiles }, { data: businessProfiles }] = await Promise.all([
    admin.from("rider_profiles").select("id").eq("user_id", user.id),
    admin.from("business_profiles").select("id").eq("user_id", user.id)
  ]);

  const riderProfileIds = (riderProfiles || []).map((profile) => profile.id).filter(Boolean);
  const businessProfileIds = (businessProfiles || []).map((profile) => profile.id).filter(Boolean);

  await Promise.allSettled([
    admin.from("account_deletion_requests").insert({
      user_id: user.id,
      email: previousEmail,
      reason: "User requested in-app account deletion.",
      status: "completed",
      requested_at: deletedAt,
      reviewed_at: deletedAt,
      admin_notes: "Completed automatically: auth access removed and personal data anonymized."
    }),
    admin.from("push_subscriptions").delete().eq("user_id", user.id),
    admin.from("notifications").delete().eq("user_id", user.id),
    admin.from("saved_addresses").delete().eq("user_id", user.id),
    admin.from("state_waitlist").delete().eq("user_id", user.id),
    admin.from("support_messages").update({ sender_user_id: null }).eq("sender_user_id", user.id),
    admin
      .from("support_tickets")
      .update({
        user_id: null,
        contact_name: null,
        name: null,
        contact_email: null,
        email: null,
        contact_phone: null,
        phone: null,
        admin_notes: "Requester deleted their account. Support history retained without personal contact fields.",
        updated_at: deletedAt
      })
      .eq("user_id", user.id),
    admin
      .from("profiles")
      .update({
        full_name: anonymizedName,
        phone: null,
        email: null,
        avatar_url: null,
        lga: null,
        deleted_at: deletedAt,
        updated_at: deletedAt
      })
      .eq("user_id", user.id),
    admin
      .from("users")
      .update({
        full_name: anonymizedName,
        phone: null,
        email: null,
        avatar_url: null,
        default_zone: null,
        updated_at: deletedAt
      })
      .eq("id", user.id),
    admin
      .from("rider_applications")
      .update({
        full_name: anonymizedName,
        phone: previousPhone ? deletedLabel("phone", deletedAt) : "deleted",
        email: previousEmail ? deletedLabel("email", deletedAt) : "deleted",
        bank_name: "deleted",
        bank_code: "deleted",
        account_number: "deleted",
        account_name: "deleted",
        nin_url: null,
        licence_url: null,
        vehicle_reg_url: null,
        insurance_url: null,
        guarantor_url: null,
        documents: [],
        updated_at: deletedAt
      })
      .eq("user_id", user.id),
    admin
      .from("rider_profiles")
      .update({
        address: null,
        bank_name: null,
        bank_code: null,
        account_number: null,
        account_name: null,
        online: false,
        updated_at: deletedAt
      })
      .eq("user_id", user.id),
    admin
      .from("business_profiles")
      .update({
        business_name: "Deleted business",
        contact_name: null,
        phone: null,
        email: null,
        pickup_address: null,
        cac_number: null,
        updated_at: deletedAt
      })
      .eq("user_id", user.id),
    admin
      .from("marketplace_listing_applications")
      .update({
        contact_email: previousEmail ? deletedLabel("email", deletedAt) : "deleted@fastfleet.local",
        whatsapp_number: previousPhone ? deletedLabel("phone", deletedAt) : "deleted",
        updated_at: deletedAt
      })
      .eq("user_id", user.id)
  ]);

  if (riderProfileIds.length > 0) {
    await admin.from("rider_documents").delete().in("rider_profile_id", riderProfileIds);
  }

  if (businessProfileIds.length > 0) {
    await Promise.allSettled([
      admin.from("business_documents").delete().in("business_profile_id", businessProfileIds),
      admin.from("business_team_members").delete().in("business_profile_id", businessProfileIds)
    ]);
  }

  await anonymizeCustomerDeliveries(admin, user.id, deletedAt);

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id, true);
  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
