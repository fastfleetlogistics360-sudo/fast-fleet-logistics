import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RiderAccessState, RiderDashboard } from "@/components/rider/rider-dashboard";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUserRole, roleHome } from "@/lib/auth/roles";
import type { RiderApplicationStatus } from "@/types/domain";

export const metadata: Metadata = {
  title: "Rider Dashboard"
};

type RiderStatusRow = {
  status?: "approved" | "pending_review" | "rejected" | "submitted" | "under_review" | "more_info_required" | null;
  rejection_reason?: string | null;
  lga?: string | null;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
};

type RiderProfileStatusRow = {
  id?: string | null;
  application_status?: "approved" | "submitted" | "under_review" | "rejected" | "more_info_required" | null;
  suspension_reason?: string | null;
  vehicle_type?: string | null;
  online?: boolean | null;
};

export default async function RiderDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/rider/dashboard&account=rider");

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  const role = parseUserRole(profile?.account_type);
  if (!role) redirect("/choose-account-type?returnTo=/rider/dashboard");
  if (role !== "rider") redirect(roleHome[role]);

  const [applicationResult, riderProfileResult] = await Promise.all([
    supabase
      .from("rider_applications")
      .select("status, rejection_reason, lga, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<RiderStatusRow>(),
    supabase.from("rider_profiles").select("id, application_status, suspension_reason, vehicle_type, online").eq("user_id", user.id).maybeSingle<RiderProfileStatusRow>()
  ]);

  const rawStatus = applicationResult.data?.status || riderProfileResult.data?.application_status || "pending_review";
  const status = rawStatus === "submitted" || rawStatus === "under_review" ? "pending_review" : rawStatus;
  const rejectionReason = applicationResult.data?.rejection_reason || riderProfileResult.data?.suspension_reason || null;

  if (!applicationResult.data && !riderProfileResult.data) redirect("/rider/onboarding");
  if (status !== "approved") return <RiderAccessState status={status} rejectionReason={rejectionReason} />;
  await ensureDispatchProfileForApprovedRider(user.id, applicationResult.data, riderProfileResult.data);
  return <RiderDashboard initialKycStatus="approved" />;
}

async function ensureDispatchProfileForApprovedRider(userId: string, application: RiderStatusRow | null, riderProfile: RiderProfileStatusRow | null) {
  const admin = createAdminClient();
  if (!admin) return;

  const dispatchVehicle = normalizeDispatchVehicle(riderProfile?.vehicle_type || application?.vehicle_type);
  if (riderProfile?.id && riderProfile.application_status === "approved" && riderProfile.online === true && riderProfile.vehicle_type === dispatchVehicle) return;

  await admin
    .from("rider_profiles")
    .upsert(
      {
        user_id: userId,
        application_status: "approved" as RiderApplicationStatus,
        address: application?.lga || null,
        operating_zone: application?.lga || null,
        vehicle_type: dispatchVehicle,
        plate_number: application?.plate_number || null,
        vehicle_color: application?.vehicle_color || null,
        bank_name: application?.bank_name || null,
        account_number: application?.account_number || null,
        account_name: application?.account_name || null,
        online: true,
        reviewed_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
}

function normalizeDispatchVehicle(vehicleType: string | null | undefined) {
  if (vehicleType === "car" || vehicleType === "van" || vehicleType === "bike") return vehicleType;
  return "bike";
}
