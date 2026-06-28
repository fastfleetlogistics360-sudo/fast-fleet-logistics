import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Sign In"
};

export default function AuthPage() {
  return (
    <section className="section-wrap grid gap-5 py-6 sm:py-10 lg:min-h-screen lg:grid-cols-[minmax(0,0.9fr)_minmax(280px,0.62fr)] lg:items-center lg:py-12">
      <div className="flex items-center">
        <Suspense fallback={<AuthFormSkeleton />}>
          <PhoneAuthForm className="w-full" />
        </Suspense>
      </div>
      <aside className="rounded-[22px] border border-white/80 bg-white/[0.88] p-4 text-fleet-night shadow-[0_18px_48px_rgba(8,17,31,0.08)] ring-1 ring-fleet-line/35 backdrop-blur-2xl sm:p-5">
        <div className="flex items-center gap-3 rounded-[18px] border border-fleet-line/70 bg-white/80 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-black">Your data is safe with us</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">We use strong protections to help keep your account secure.</p>
          </div>
        </div>
        <p className="mt-5 text-center text-sm font-medium leading-6 text-slate-600">
          By continuing, you agree to our <Link href="/terms" className="font-bold text-fleet-ember transition hover:text-fleet-night">Terms of Service</Link> and <Link href="/privacy" className="font-bold text-fleet-ember transition hover:text-fleet-night">Privacy Policy</Link>.
        </p>
      </aside>
    </section>
  );
}

function AuthFormSkeleton() {
  return (
    <div className="rounded-[20px] border border-fleet-line bg-white p-5 shadow-lift">
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
