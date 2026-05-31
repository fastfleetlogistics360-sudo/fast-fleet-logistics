"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, Building2, Loader2, MapPinned, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { roleHome, roleSignupHome, safeDashboardRedirectForRole } from "@/lib/auth/roles";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { uploadProfilePhoto } from "@/lib/storage";
import type { UserRole } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

const options: Array<{ role: Exclude<UserRole, "admin">; title: string; body: string; icon: LucideIcon }> = [
  {
    role: "customer",
    title: "Customer",
    body: "Book deliveries, track riders live, manage wallet, receipts, and support.",
    icon: UserRound
  },
  {
    role: "rider",
    title: "Rider",
    body: "Complete onboarding, receive jobs, share live delivery tracking, and manage payouts.",
    icon: Bike
  },
  {
    role: "business",
    title: "Business",
    body: "Create dispatches, manage saved pickup points, bulk orders, team access, and invoices.",
    icon: Building2
  }
];

export function ChooseAccountTypeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [selected, setSelected] = useState<Exclude<UserRole, "admin">>("customer");
  const [customerState, setCustomerState] = useState("Lagos");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
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
      const now = new Date().toISOString();
      const selectedState = selected === "customer" ? normalizeState(customerState) || "Lagos" : "Lagos";
      if (!profilePhotoFile) throw new Error("Upload a profile picture before continuing.");
      const profilePhoto = await uploadProfilePhoto(user.id, profilePhotoFile);
      const [metadataResult, usersResult, profilesResult] = await Promise.allSettled([
        supabase.auth.updateUser({ data: { account_type: selected, role: selected, avatar_url: profilePhoto.publicUrl, default_zone: selectedState, state: selected === "customer" ? selectedState : undefined } }),
        supabase.from("users").upsert({
          id: user.id,
          email: user.email || null,
          phone: user.phone || null,
          full_name: fullName,
          avatar_url: profilePhoto.publicUrl,
          role: selected,
          default_zone: selectedState,
          updated_at: now
        }),
        supabase.from("profiles").upsert({
          id: user.id,
          user_id: user.id,
          email: user.email || null,
          phone: user.phone || null,
          full_name: fullName,
          avatar_url: profilePhoto.publicUrl,
          account_type: selected,
          lga: selectedState,
          updated_at: now
        })
      ]);

      const failed = [metadataResult, usersResult, profilesResult].find((result) => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;

      const destination = selected === "customer" ? returnTo || roleHome.customer : roleSignupHome[selected];
      router.replace(safeDashboardRedirectForRole(destination, selected));
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your account type.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-5xl p-5 sm:p-7">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">One last step</span>
      <h1 className="mt-3 text-3xl font-black text-fleet-night sm:text-5xl">Choose your Fast Fleets 360 account type.</h1>
      <p className="mt-3 max-w-2xl text-sm font-semibold leading-7 text-slate-600">
        This controls which dashboard, permissions, and onboarding flow your OAuth account uses.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {options.map((option) => {
          const Icon = option.icon;
          const active = selected === option.role;
          return (
            <button
              key={option.role}
              type="button"
              onClick={() => setSelected(option.role)}
              className={cn("rounded-fleet border p-4 text-left transition", active ? "border-fleet-navy bg-fleet-navy text-white shadow-lift" : "border-fleet-line bg-white text-fleet-night hover:border-fleet-gold")}
            >
              <Icon className="h-6 w-6" />
              <strong className="mt-4 block text-lg font-black">{option.title}</strong>
              <span className={cn("mt-2 block text-sm font-semibold leading-6", active ? "text-white/80" : "text-slate-600")}>{option.body}</span>
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
            Live states are controlled from admin. Other states receive early-access dashboard access while rollout expands.
          </span>
        </label>
      ) : null}

      <label className="form-field mt-5">
        <span className="form-label">Profile picture</span>
        <span className="flex items-center gap-3 rounded-fleet border border-fleet-line bg-white p-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-fleet-navy text-sm font-black text-white">
            {initials(profilePhotoFile?.name || "User")}
          </span>
          <span className="min-w-0 flex-1 text-sm font-bold text-slate-600">{profilePhotoFile?.name || "Upload a clear profile picture for this account."}</span>
          <span className="rounded-fleet bg-fleet-paper px-3 py-2 text-xs font-black text-fleet-night">Choose</span>
          <input className="sr-only" type="file" accept="image/*" onChange={(event) => setProfilePhotoFile(event.target.files?.[0] || null)} />
        </span>
      </label>

      {message ? <div className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}

      <Button type="button" className="mt-6 w-full bg-fleet-navy hover:bg-fleet-night" onClick={saveAccountType} disabled={loading || !profilePhotoFile}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {selected === "rider" ? "Continue to rider KYC" : selected === "business" ? "Continue to business KYC" : "Continue to dashboard"}
      </Button>
    </Card>
  );
}
