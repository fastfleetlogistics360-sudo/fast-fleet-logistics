import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BusinessDashboard } from "@/components/dashboard/business-dashboard";
import { createClient } from "@/lib/supabase/server";
import { parseUserRole, roleHome } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Business Dashboard"
};

export default async function BusinessDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/business/dashboard&account=business");

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  const role = parseUserRole(profile?.account_type);
  if (!role) redirect("/choose-account-type?returnTo=/business/dashboard");
  if (role !== "business") redirect(roleHome[role]);
  if (!user.email_confirmed_at) redirect("/auth?returnTo=/business/dashboard&account=business");

  return <BusinessDashboard />;
}
