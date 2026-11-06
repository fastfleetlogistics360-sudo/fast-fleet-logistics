import type { Metadata } from "next";
import { BicycleRiderApplication } from "@/components/rider/bicycle-rider-application";
import { CyclistRecruitmentLanding } from "@/components/cyclist/cyclist-recruitment-landing";
import { parseUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Become a Bicycle Rider",
  description: "Apply for bicycle rider opportunities with Fast Fleets 360. Join the delivery network, complete verification, and manage delivery work in Nigeria.",
  keywords: ["bicycle rider jobs Nigeria", "dispatch rider jobs", "delivery rider jobs Lagos", "become a delivery rider"],
  alternates: { canonical: "/cyclist" },
  robots: { index: true, follow: true }
};

type CyclistPageProps = { searchParams: Promise<{ ref?: string }> };

export default async function CyclistPage({ searchParams }: CyclistPageProps) {
  const { ref } = await searchParams;
  const cleanRef = typeof ref === "string" ? ref.trim() : "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const claimReturnTo = `/cyclist${cleanRef ? `?ref=${encodeURIComponent(cleanRef)}` : ""}`;
  const authReturnTo = cleanRef ? `/referrals/claim?returnTo=${encodeURIComponent(claimReturnTo)}` : claimReturnTo;

  if (!user) {
    return <CyclistRecruitmentLanding referralCode={cleanRef || null} continueHref={`/auth?account=rider&returnTo=${encodeURIComponent(authReturnTo)}`} />;
  }

  const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>();
  const role = parseUserRole(profile?.account_type);
  if (role !== "rider") {
    const destination = cleanRef ? `/referrals/claim?returnTo=${encodeURIComponent("/choose-account-type?returnTo=/cyclist")}` : "/choose-account-type?returnTo=/cyclist";
    return <CyclistRecruitmentLanding referralCode={cleanRef || null} continueHref={destination} />;
  }

  return <BicycleRiderApplication />;
}
