"use client";

import { useEffect, useMemo, useState } from "react";
import { Bike, CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export function CyclistRecruitmentLanding({ referralCode, continueHref = "/auth?account=rider&returnTo=%2Fcyclist" }: { referralCode?: string | null; continueHref?: string }) {
  const [referralMessage, setReferralMessage] = useState<string | null>(null);
  const ref = useMemo(() => String(referralCode || "").trim(), [referralCode]);

  useEffect(() => {
    if (!ref) return;
    let mounted = true;
    fetch("/api/referrals/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: ref, campaign: "cyclist" }) })
      .then(async (response) => ({ ok: response.ok, result: await response.json().catch(() => ({})) }))
      .then(({ ok, result }) => mounted && setReferralMessage(ok ? "Your cyclist referral invitation has been saved." : result.error || "This referral link could not be saved."))
      .catch(() => mounted && setReferralMessage("This referral link could not be saved. You can still apply."));
    return () => { mounted = false; };
  }, [ref]);

  return <main className="bg-fleet-paper"><section className="bg-fleet-night text-white"><div className="section-wrap py-14 sm:py-20"><span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-fleet-gold"><Bike className="h-4 w-4" /> Fast Fleets 360 riders</span><h1 className="mt-5 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">Deliver with a Fast Fleets 360 bicycle.</h1><p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-white/80 sm:text-lg">Apply with one normal Rider account. If you are approved, Fleet Operations assigns an available bicycle before you receive bicycle delivery offers.</p><div className="mt-8 flex flex-wrap gap-3"><LinkButton href={continueHref}>Apply as a Bicycle Rider</LinkButton><LinkButton href="/rider/onboarding" variant="secondary">I already have a Rider account</LinkButton></div>{referralMessage ? <p className="mt-5 inline-flex items-center gap-2 rounded-fleet bg-white/10 px-3 py-2 text-sm font-bold text-white/85">{referralMessage.includes("saved") ? <CheckCircle2 className="h-4 w-4 text-fleet-gold" /> : <Loader2 className="h-4 w-4" />}{referralMessage}</p> : null}</div></section><section className="section-wrap grid gap-4 py-10 sm:grid-cols-3 sm:py-14"><RecruitmentPoint icon={<ShieldCheck className="h-5 w-5" />} title="One Rider account" body="Your verification, wallet, jobs, and payouts stay inside the existing Rider experience." /><RecruitmentPoint icon={<Bike className="h-5 w-5" />} title="Fleet allocation" body="Approval does not invent a bicycle. A real assigned fleet asset is required before bicycle work." /><RecruitmentPoint icon={<CheckCircle2 className="h-5 w-5" />} title="Clear next steps" body="Track your application and assigned bicycle from your Rider Dashboard." /></section></main>;
}

function RecruitmentPoint({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return <article className="rounded-[20px] border border-fleet-line bg-white p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-fleet-ember">{icon}</span><h2 className="mt-4 text-lg font-black text-fleet-night">{title}</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{body}</p></article>;
}
