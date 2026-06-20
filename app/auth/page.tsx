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
    <section className="section-wrap grid gap-5 py-8 sm:py-12 lg:min-h-screen lg:grid-cols-[minmax(0,0.98fr)_minmax(300px,0.72fr)] lg:items-center lg:py-16">
      <div className="flex items-center">
        <Suspense fallback={<AuthFormSkeleton />}>
          <PhoneAuthForm className="w-full" />
        </Suspense>
      </div>
      <aside className="rounded-[16px] bg-fleet-night p-5 text-white shadow-[0_14px_34px_rgba(8,17,31,0.16)] sm:p-6">
        <div className="flex items-center gap-4 rounded-[14px] border border-white/10 bg-white/[0.045] p-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fleet-leaf/15 text-fleet-mint">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-black">Your data is safe with us</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-white/65">We use strong protections to help keep your account secure.</p>
          </div>
        </div>
        <p className="mt-6 text-center text-sm font-medium leading-6 text-white/65">
          By continuing, you agree to our <Link href="/terms" className="font-bold text-fleet-gold transition hover:text-white">Terms of Service</Link> and <Link href="/privacy" className="font-bold text-fleet-gold transition hover:text-white">Privacy Policy</Link>.
        </p>
      </aside>
    </section>
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
