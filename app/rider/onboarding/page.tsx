import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { RiderOnboardingFlow } from "@/components/onboarding/rider-onboarding-flow";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rider Onboarding"
};

export default async function RiderOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth?returnTo=/rider/onboarding&account=rider");

  return (
    <section className="section-wrap py-8 sm:py-12">
      <RiderOnboardingFlow />
    </section>
  );
}
