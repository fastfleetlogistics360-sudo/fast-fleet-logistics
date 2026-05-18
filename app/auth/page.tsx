import { Suspense } from "react";
import type { Metadata } from "next";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { RoutePreview } from "@/components/maps/route-preview";

export const metadata: Metadata = {
  title: "Sign In"
};

export default function AuthPage() {
  return (
    <section className="section-wrap grid gap-8 py-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-16">
      <div>
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">FastFleet account</span>
        <h2 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-6xl">Sign in and keep every delivery in view.</h2>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-slate-600 sm:text-base">
          Customers manage orders and wallet payments. Drivers get a locked driver account type, then complete KYC from the driver dashboard. Businesses get vendor dispatch tools after email verification.
        </p>
        <div className="mt-6">
          <RoutePreview compact label="Auth location context" />
        </div>
      </div>
      <Suspense>
        <PhoneAuthForm />
      </Suspense>
    </section>
  );
}
