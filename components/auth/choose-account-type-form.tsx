"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, Building2, Loader2, MapPinned, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { safeDashboardRedirectForRole } from "@/lib/auth/roles";
import type { SelfServiceRole } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

const options: Array<{ role: SelfServiceRole; title: string; icon: LucideIcon }> = [
  {
    role: "customer",
    title: "Customer",
    icon: UserRound
  },
  {
    role: "rider",
    title: "Rider",
    icon: Bike
  },
  {
    role: "business",
    title: "Business",
    icon: Building2
  }
];

export function ChooseAccountTypeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [selected, setSelected] = useState<SelfServiceRole>("customer");
  const [customerState, setCustomerState] = useState("Lagos");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveAccountType() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Please sign in again to choose an account type.");

      const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Fast Fleets 360 user";
      const selectedState = selected === "customer" ? normalizeState(customerState) || "Lagos" : "Lagos";
      const response = await fetch("/api/account/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: selected, state: selectedState, fullName })
      });
      if (!response.ok) throw new Error("Could not complete account setup. Please try again.");

      await fetch("/api/promos/launch-first-150/enroll", { method: "POST" }).catch(() => null);
      const destination = returnTo || "/hub";
      router.replace(safeDashboardRedirectForRole(destination, selected));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your account type.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl p-4 sm:p-5">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">One last step</span>
      <h1 className="mt-2 text-2xl font-black text-fleet-night sm:text-3xl">Choose your account type.</h1>

      <div className="mt-5 grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const active = selected === option.role;
          return (
            <button
              key={option.role}
              type="button"
              onClick={() => setSelected(option.role)}
              className={cn("flex min-h-16 items-center gap-3 rounded-[14px] border px-3 py-2 text-left transition", active ? "border-fleet-navy bg-fleet-navy text-white shadow-lift" : "border-fleet-line bg-white text-fleet-night hover:border-fleet-gold")}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <strong className="block text-sm font-black">{option.title}</strong>
            </button>
          );
        })}
      </div>

      {selected === "customer" ? (
        <label className="form-field mt-5">
          <span className="form-label">Select Your State</span>
          <span className="relative">
            <MapPinned className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fleet-ember" />
            <select className="form-input pl-10" value={customerState} onChange={(event) => setCustomerState(event.target.value)} required>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </span>
          <span className="text-xs font-bold leading-5 text-slate-500">
            Delivery availability depends on your selected state. Other states receive early access while coverage expands.
          </span>
        </label>
      ) : null}

      {message ? <div className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}

      <Button type="button" className="mt-6 w-full bg-fleet-navy hover:bg-fleet-night" onClick={saveAccountType} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {selected === "rider" ? "Continue to rider KYC" : selected === "business" ? "Continue to business KYC" : "Continue to dashboard"}
      </Button>
    </Card>
  );
}
