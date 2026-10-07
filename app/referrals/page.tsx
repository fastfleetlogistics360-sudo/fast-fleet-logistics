import { redirect } from "next/navigation";
import { ReferralDashboard } from "@/components/referrals/referral-dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReferralPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth?returnTo=/referrals");
  return <ReferralDashboard />;
}
