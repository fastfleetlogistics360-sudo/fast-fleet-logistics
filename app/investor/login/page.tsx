import { Suspense } from "react";
import type { Metadata } from "next";
import { MailCheck, ShieldCheck } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

export const metadata: Metadata = {
  title: "Investor Sign In",
  description: "Secure sign-in for Fast Fleets 360 Logistics investors.",
  robots: { index: false, follow: false }
};

export default function InvestorLoginPage() {
  return (
    <section className="section-wrap grid gap-5 py-6 sm:py-10 lg:min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.62fr)] lg:items-center lg:py-12">
      <Suspense fallback={<div className="min-h-96 rounded-[20px] border border-fleet-line bg-white p-5 shadow-lift" />}>
        <PhoneAuthForm
          title="Investor sign in"
          description="Use the email and password created during your Fast Fleets investor activation."
          returnToOverride="/investor/dashboard"
          intent="login"
          allowSignup={false}
          allowGoogle={false}
          requiredRole="investor"
          className="w-full"
        />
      </Suspense>
      <aside className="rounded-[22px] border border-white/80 bg-white/[0.88] p-5 text-fleet-night shadow-[0_18px_48px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
          <div><h1 className="text-lg font-black">Already activated?</h1><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Sign in here with the email and password you created. You will be taken directly to your investor dashboard.</p></div>
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-[18px] border border-fleet-line bg-fleet-paper p-4">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-fleet-ember" />
          <div><h2 className="font-black">New investor?</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">Investor accounts are created by Fast Fleets 360 admin. Ask the team to send your secure invitation, then use that email link to set your password and payout details. After activation, return here whenever you need to sign in.</p></div>
        </div>
      </aside>
    </section>
  );
}
