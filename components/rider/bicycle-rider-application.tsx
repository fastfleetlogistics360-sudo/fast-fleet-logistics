"use client";

import { useEffect, useState } from "react";
import { Bike, CheckCircle2, Loader2, ShieldAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { BackButton } from "@/components/ui/back-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type RiderProfile = { application_status?: string | null; onboarding_path?: string | null; operating_zone?: string | null };
type CyclistApplicationRow = { id: string; status: string; submitted_at?: string | null; reviewed_at?: string | null; approved_at?: string | null; rider_activated_at?: string | null; rejection_reason?: string | null; residential_area?: string | null; preferred_operating_zone?: string | null; employment_preference?: string | null; experience_notes?: string | null };
type Payload = { application: CyclistApplicationRow | null; riderProfile: RiderProfile | null; onboardingPath?: string | null };

export function BicycleRiderApplication() {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const response = await fetch("/api/rider/cyclist-application", { cache: "no-store" });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Could not load your bicycle rider application.");
    setPayload(result);
  }

  useEffect(() => {
    let mounted = true;
    Promise.all([
      load(),
      fetch("/api/rider/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "bicycle_application" }) }).catch(() => undefined)
    ])
      .catch((error) => mounted && setMessage(error instanceof Error ? error.message : "Could not load your bicycle rider application."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, []);

  async function submit(form: FormData) {
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/rider/cyclist-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canRideBicycle: form.get("canRide") === "on",
          residentialArea: form.get("area"),
          preferredOperatingZone: form.get("zone"),
          employmentPreference: form.get("preference"),
          hasSmartphone: form.get("smartphone") === "on",
          hasValidId: form.get("id") === "on",
          hasGuarantor: form.get("guarantor") === "on",
          experienceNotes: form.get("notes")
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not submit your bicycle rider application.");
      await load();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit your bicycle rider application.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="section-wrap grid min-h-[60vh] place-items-center"><Loader2 className="h-7 w-7 animate-spin text-fleet-ember" /></main>;
  const application = payload?.application || null;
  const approved = payload?.riderProfile?.application_status === "approved";
  const canApply = !approved && (!application || application.status === "rejected" || application.status === "withdrawn" || application.status === "suspended");

  return (
    <main className="section-wrap max-w-3xl py-6 sm:py-10">
      <BackButton className="mb-4" />
      <section className="rounded-[26px] bg-fleet-night p-6 text-white sm:p-8">
        <span className="grid h-12 w-12 place-items-center rounded-[16px] bg-white/10 text-fleet-gold"><Bike className="h-6 w-6" /></span>
        <p className="mt-5 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">Fast Fleets 360</p>
        <h1 className="mt-2 text-3xl font-black sm:text-4xl">Bicycle Rider Application</h1>
        <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-white/75">Ride with Fast Fleets 360 using a company or fleet bicycle. Your Rider account, wallet, deliveries, and approval status stay in the same system.</p>
      </section>

      {message ? <p role="alert" className="mt-5 rounded-fleet bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</p> : null}

      {application && !canApply ? <ApplicationStatus application={application} approved={approved} /> : null}
      {approved && !application ? <Card className="mt-5 p-6"><CheckCircle2 className="h-8 w-8 text-emerald-600" /><h2 className="mt-3 text-2xl font-black text-fleet-night">Your Rider account is already approved</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Open your Rider Dashboard to view your current bicycle allocation and delivery eligibility.</p><LinkButton href="/rider/dashboard" className="mt-5">Open Rider Dashboard</LinkButton></Card> : null}
      {canApply ? <ApplicationForm application={application} submitting={submitting} onSubmit={submit} defaultZone={payload?.riderProfile?.operating_zone || ""} /> : null}
    </main>
  );
}

function ApplicationStatus({ application, approved }: { application: CyclistApplicationRow; approved: boolean }) {
  const rejected = application.status === "rejected";
  const activated = application.status === "rider_activated";
  return <Card className="mt-5 p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Application status</p><h2 className="mt-1 text-2xl font-black text-fleet-night">{activated ? "Bicycle rider active" : approved ? "Application approved" : rejected ? "Application needs attention" : "Application submitted"}</h2></div><StatusBadge tone={rejected ? "red" : approved ? "green" : "amber"}>{cyclistStatusLabel(application.status)}</StatusBadge></div><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{activated ? "Your fleet bicycle allocation is active. Use the Rider Dashboard for current availability." : approved ? "Your Rider KYC is approved. Bicycle assignment is handled separately by Fleet Operations; you cannot receive bicycle offers until an assigned bicycle is available." : rejected ? application.rejection_reason || "Review the note and submit a new application when you are ready." : "We’ll review your application and update your Rider Dashboard when a decision has been made."}</p>{rejected ? <LinkButton href="/rider/onboarding" variant="secondary" className="mt-5">Choose another rider path</LinkButton> : <LinkButton href="/rider/dashboard" variant="secondary" className="mt-5">Open Rider Dashboard</LinkButton>}</Card>;
}

function cyclistStatusLabel(status: string | null | undefined) {
  const value = String(status || "").trim();
  return value === "rider_activated" ? "Bicycle assigned" : value ? value.replaceAll("_", " ") : "Not started";
}

function ApplicationForm({ application, defaultZone, submitting, onSubmit }: { application: CyclistApplicationRow | null; defaultZone: string; submitting: boolean; onSubmit: (form: FormData) => Promise<void> }) {
  return <form action={onSubmit} className="mt-5 rounded-[22px] border border-fleet-line bg-white p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-fleet-ember"><ShieldAlert className="h-5 w-5" /></span><div><h2 className="text-xl font-black text-fleet-night">Tell us about your availability</h2><p className="mt-1 text-sm font-semibold leading-6 text-slate-600">This is your alternative Rider verification path. It does not create a second account.</p></div></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="form-field"><span className="form-label">Residential area</span><input name="area" required defaultValue={application?.residential_area || ""} className="form-input" /></label><label className="form-field"><span className="form-label">Preferred operating zone</span><input name="zone" required defaultValue={application?.preferred_operating_zone || defaultZone} className="form-input" /></label></div><label className="form-field mt-4"><span className="form-label">Work preference</span><select name="preference" defaultValue={application?.employment_preference || "full_time"} className="form-input"><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="flexible">Flexible</option></select></label><label className="form-field mt-4"><span className="form-label">Optional experience notes</span><textarea name="notes" defaultValue={application?.experience_notes || ""} className="form-input min-h-24" /></label><div className="mt-5 grid gap-2 rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-fleet-night">{[["canRide", "I can ride a bicycle"], ["smartphone", "I have a smartphone"], ["id", "I have a valid ID"], ["guarantor", "I have a guarantor"]].map(([name, label]) => <label key={name} className="flex items-center gap-2"><input name={name} type="checkbox" required /> {label}</label>)}</div><Button disabled={submitting} className="mt-5 w-full bg-fleet-navy hover:bg-fleet-night">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Submit bicycle rider application</Button></form>;
}
