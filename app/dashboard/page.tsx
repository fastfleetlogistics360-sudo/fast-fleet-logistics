import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CustomerDashboard } from "@/components/dashboard/customer-dashboard";
import { createClient } from "@/lib/supabase/server";
import { normalizeRole, roleHome } from "@/lib/auth/roles";

export const metadata: Metadata = {
  title: "Customer Dashboard"
};

export default async function DashboardPage() {
  let redirectTarget: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
      const role = normalizeRole(profile?.role || user.user_metadata?.role || user.user_metadata?.account_type);
      if (role !== "customer") redirectTarget = roleHome[role];
    }
  } catch {
    // Local preview without Supabase env vars still renders the customer dashboard.
  }
  if (redirectTarget) redirect(redirectTarget);

  return <CustomerDashboard />;
}
