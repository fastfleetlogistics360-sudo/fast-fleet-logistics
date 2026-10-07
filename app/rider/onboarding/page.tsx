import type { Metadata } from "next";
import { Suspense } from "react";
import { Bike, FileCheck2, ShieldCheck } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { RiderOnboardingFlow } from "@/components/onboarding/rider-onboarding-flow";
import { RiderOnboardingChoice } from "@/components/onboarding/rider-onboarding-choice";
import { BackButton } from "@/components/ui/back-button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { parseUserRole } from "@/lib/auth/roles";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Rider Onboarding"
};

type RiderOnboardingPageProps = {
  searchParams: Promise<{ path?: string }>;
};

export default async function RiderOnboardingPage({ searchParams }: RiderOnboardingPageProps) {
  const { path } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="section-wrap grid gap-4 pb-8 pt-4 sm:pb-12 sm:pt-6 lg:grid-cols-[0.72fr_1.28fr]">
        <BackButton className="lg:col-span-2" />
        <Card className="self-start p-4 sm:p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Rider onboarding</span>
          <h1 className="mt-2 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Create rider account.</h1>
          <div className="mt-5 grid gap-2">
            {[
              ["Account", ShieldCheck],
              ["Documents", FileCheck2],
              ["Review", Bike]
            ].map(([title, Icon]) => (
              <div key={String(title)} className="flex items-center gap-3 rounded-[14px] bg-fleet-paper px-3 py-2">
                <Icon className="h-4 w-4 shrink-0 text-fleet-ember" />
                <strong className="block text-sm font-black text-fleet-night">{String(title)}</strong>
              </div>
            ))}
          </div>
        </Card>
        <Suspense fallback={<RiderAuthSkeleton />}>
          <PhoneAuthForm
            title="Create rider account"
            description=""
            defaultRole="rider"
            lockedRole="rider"
            returnToOverride="/rider/onboarding"
            intent="signup"
          />
        </Suspense>
      </section>
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, rider_onboarding_path")
    .eq("user_id", user.id)
    .maybeSingle<{ account_type?: string | null; rider_onboarding_path?: string | null }>();
  if (parseUserRole(profile?.account_type) !== "rider") redirect("/choose-account-type?returnTo=/rider/onboarding");

  // The standard form remains exactly the existing rider KYC flow. It is
  // entered only after the server has recorded this rider's chosen path.
  if (path === "standard" && profile?.rider_onboarding_path === "standard") {
    return <section className="section-wrap pb-8 pt-4 sm:pb-12 sm:pt-6"><BackButton className="mb-4" /><RiderOnboardingFlow /></section>;
  }

  return <RiderOnboardingChoice initialMode={profile?.rider_onboarding_path} />;
}

function RiderAuthSkeleton() {
  return (
    <Card className="p-4 sm:p-6">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="mt-4 h-10 w-4/5" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
      <Skeleton className="mt-3 h-11 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
    </Card>
  );
}
