import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { CinematicPageHero } from "@/components/layout/cinematic-page-hero";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign In"
};

export default function AuthPage() {
  return (
    <>
    <CinematicPageHero
      eyebrow="Secure access"
      title="One account for customers, riders, and business dispatch."
      body="Sign in with the same premium FAST FLEETS360 identity system that powers bookings, payouts, onboarding, and tracking."
      image="https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=2200&q=84"
      className="min-h-0"
    />
    <section className="section-wrap -mt-8 grid gap-6 pb-10 sm:-mt-10 sm:pb-12 lg:min-h-[calc(100vh-18rem)] lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
      <div className="flex items-center">
        <Suspense fallback={<AuthFormSkeleton />}>
          <PhoneAuthForm className="w-full" />
        </Suspense>
      </div>
      <aside className="overflow-hidden rounded-fleet border border-white/15 bg-fleet-night text-white shadow-glow">
        <div className="grid min-h-[360px] gap-6 p-5 sm:p-8 lg:min-h-full lg:content-between">
          <div>
            <div className="inline-flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-fleet bg-white text-lg font-black text-fleet-navy">FF</span>
              <span className="text-xl font-black tracking-[0.02em]">FAST FLEETS360</span>
            </div>
            <h2 className="mt-8 max-w-xl text-4xl font-black leading-tight sm:text-5xl">Move orders, payouts, and rider onboarding from one secure account.</h2>
            <p className="mt-4 max-w-lg text-sm font-semibold leading-7 text-white/75 sm:text-base">
              Customers, riders, and business partners get a locked account type at registration, then land in the dashboard built for their work.
            </p>
          </div>
          <div className="relative min-h-64 overflow-hidden rounded-fleet border border-white/15 bg-white/10 p-4">
            <div className="absolute left-6 right-6 top-10 h-1 rounded-full bg-white/30" />
            <div className="absolute left-10 top-8 grid h-12 w-12 place-items-center rounded-full bg-fleet-gold text-sm font-black text-fleet-night shadow-lift">A</div>
            <div className="absolute right-10 top-8 grid h-12 w-12 place-items-center rounded-full bg-fleet-mint text-sm font-black text-fleet-night shadow-lift">B</div>
            <div className="absolute left-1/2 top-4 h-20 w-20 -translate-x-1/2 rounded-full border-4 border-white/70 bg-fleet-blue shadow-lift">
              <div className="absolute left-5 top-6 h-3 w-10 rounded-full bg-white" />
              <div className="absolute bottom-3 left-4 h-5 w-5 rounded-full bg-fleet-night" />
              <div className="absolute bottom-3 right-4 h-5 w-5 rounded-full bg-fleet-night" />
            </div>
            <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-3">
              {["Email auth", "Google sign-in", "Role-locked access"].map((item) => (
                <div key={item} className="rounded-fleet border border-white/15 bg-white/10 p-3 text-xs font-black uppercase tracking-[0.12em] text-white/85">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </section>
    </>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="rounded-fleet border border-fleet-line bg-white p-5 shadow-lift">
      <Skeleton className="h-6 w-32" />
      <Skeleton className="mt-4 h-10 w-4/5" />
      <Skeleton className="mt-3 h-5 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
      <Skeleton className="mt-3 h-12 w-full" />
      <Skeleton className="mt-3 h-12 w-full" />
      <Skeleton className="mt-6 h-12 w-full" />
    </div>
  );
}
