import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RiderAccessState, RiderDashboard } from "@/components/rider/rider-dashboard";
import { createClient } from "@/lib/supabase/server";
import { normalizeRole, roleHome } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Rider Dashboard"
};

type RiderStatusRow = {
  status?: "approved" | "pending_review" | "rejected" | "submitted" | "under_review" | "more_info_required" | null;
  rejection_reason?: string | null;
};

type RiderProfileStatusRow = {
  application_status?: "approved" | "submitted" | "under_review" | "rejected" | "more_info_required" | null;
  suspension_reason?: string | null;
};

export default async function RiderDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/rider/dashboard&account=rider");

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  const role = normalizeRole(profile?.account_type || user.user_metadata?.account_type || user.user_metadata?.role);
  if (role !== "rider") redirect(roleHome[role]);

  const [applicationResult, riderProfileResult] = await Promise.all([
    supabase.from("rider_applications").select("status, rejection_reason").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<RiderStatusRow>(),
    supabase.from("rider_profiles").select("application_status, suspension_reason").eq("user_id", user.id).maybeSingle<RiderProfileStatusRow>()
  ]);

  const rawStatus = applicationResult.data?.status || riderProfileResult.data?.application_status || "pending_review";
  const status = rawStatus === "submitted" || rawStatus === "under_review" ? "pending_review" : rawStatus;
  const rejectionReason = applicationResult.data?.rejection_reason || riderProfileResult.data?.suspension_reason || null;

  if (status !== "approved") return <RiderAccessState status={status} rejectionReason={rejectionReason} />;
  return <RiderDashboard initialKycStatus="approved" />;
}
