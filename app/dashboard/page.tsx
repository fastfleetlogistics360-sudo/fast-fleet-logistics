import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";
import { createClient } from "@/lib/supabase/server";
import { parseUserRole, roleHome } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Customer Dashboard"
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/dashboard");

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  const role = parseUserRole(profile?.account_type);
  if (!role) redirect("/choose-account-type?returnTo=/dashboard");
  const redirectTarget = role !== "customer" ? roleHome[role] : null;
  if (redirectTarget) redirect(redirectTarget);

  return <CustomerDashboard />;
}
