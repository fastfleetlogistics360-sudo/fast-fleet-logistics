"use client";

import { useState } from "react";
import { Bike, ClipboardCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function RiderOnboardingChoice({ initialMode }: { initialMode?: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = useState<"standard" | "bicycle_application" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function choose(mode: "standard" | "bicycle_application") {
    setSaving(mode);
    setMessage(null);
    try {
      const response = await fetch("/api/rider/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save your onboarding choice.");
      router.push(mode === "standard" ? "/rider/onboarding?path=standard" : "/cyclist");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your onboarding choice.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <main className="section-wrap py-8 sm:py-12">
      <Card className="mx-auto max-w-3xl p-5 sm:p-8">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Rider onboarding</span>
        <h1 className="mt-2 text-3xl font-black text-fleet-night sm:text-4xl">Complete Rider Verification</h1>
        <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Choose the path that fits how you plan to make deliveries. Both routes use your normal Rider account and are reviewed by Fast Fleets 360.</p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <section className="rounded-[20px] border border-fleet-line bg-white p-5">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-slate-100 text-fleet-night"><ClipboardCheck className="h-5 w-5" /></span>
            <h2 className="mt-4 text-xl font-black text-fleet-night">Standard Rider KYC</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">For motorcycle, tricycle, car, and van riders. Your existing verification flow remains unchanged.</p>
            <Button className="mt-5 w-full" disabled={saving !== null} onClick={() => void choose("standard")}>
              {saving === "standard" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Continue Standard Rider KYC
            </Button>
          </section>

          <section className="rounded-[20px] border border-fleet-gold bg-amber-50 p-5">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-fleet-night text-white"><Bike className="h-5 w-5" /></span>
            <h2 className="mt-4 text-xl font-black text-fleet-night">Bicycle Rider Application</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Apply to use a Fast Fleets 360 bicycle for deliveries. Your application is reviewed before activation and bicycle allocation.</p>
            <Button className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night" disabled={saving !== null} onClick={() => void choose("bicycle_application")}>
              {saving === "bicycle_application" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bike className="h-4 w-4" />}
              Bicycle Rider Application
            </Button>
          </section>
        </div>
        {initialMode === "bicycle_application" ? <p className="mt-5 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">Your saved choice is Bicycle Rider Application. You can continue it here or choose the standard path before submitting an application.</p> : null}
        {message ? <p role="alert" className="mt-5 rounded-fleet bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</p> : null}
      </Card>
    </main>
  );
}
