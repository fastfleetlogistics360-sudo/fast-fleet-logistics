import type { Metadata } from "next";
import { Suspense } from "react";
import { Bike, FileCheck2, ShieldCheck } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { RiderOnboardingFlow } from "@/components/onboarding/rider-onboarding-flow";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Rider Onboarding"
};

export default async function RiderOnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <section className="section-wrap grid gap-6 py-8 sm:py-12 lg:grid-cols-[0.86fr_1.14fr]">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Rider onboarding</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Create your rider account.</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            Register first, then complete the five-step rider application with your identity, vehicle, documents, payout details, and review consent.
          </p>
          <div className="mt-5 grid gap-3">
            {[
              ["Account", "Locked rider registration and secure sign-in", ShieldCheck],
              ["Documents", "Profile photo, ID, licence, vehicle registration, and vehicle picture", FileCheck2],
              ["Review", "Operations review before dashboard activation", Bike]
            ].map(([title, body, Icon]) => (
              <div key={String(title)} className="flex gap-3 rounded-fleet bg-fleet-paper p-3">
                <Icon className="mt-1 h-4 w-4 shrink-0 text-fleet-ember" />
                <span>
                  <strong className="block text-sm font-black text-fleet-night">{String(title)}</strong>
                  <span className="text-xs font-bold text-slate-500">{String(body)}</span>
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Suspense fallback={<RiderAuthSkeleton />}>
          <PhoneAuthForm
            title="Create rider account"
            description="Create a rider account with email or Google. After sign-in, this page opens the rider application form."
            defaultRole="rider"
            lockedRole="rider"
            returnToOverride="/rider/onboarding"
            intent="signup"
          />
        </Suspense>
      </section>
    );
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <RiderOnboardingFlow />
    </section>
  );
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
