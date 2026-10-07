"use client";

import { useEffect, useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

export default function JoinReferralPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [message, setMessage] = useState("Checking your invitation…");

  useEffect(() => {
    const ref = search.get("ref") || "";
    const campaign = search.get("campaign") || "";
    fetch("/api/referrals/intent", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: ref, campaign }) })
      .then(async (response) => ({ ok: response.ok, payload: await response.json().catch(() => ({})) }))
      .then(({ ok, payload }) => {
        if (!ok) {
          setMessage(payload.error || "This invitation is invalid or no longer active.");
          return;
        }
        const next = "/referrals/claim";
        router.replace(`/auth?returnTo=${encodeURIComponent(next)}`);
      })
      .catch(() => setMessage("We could not save this invitation. Please try the link again."));
  }, [router, search]);

  return <main className="section-wrap grid min-h-[70vh] place-items-center px-4"><section className="w-full max-w-md rounded-[24px] border border-fleet-line bg-white p-6 text-center shadow-lift"><span className="mx-auto grid h-14 w-14 place-items-center rounded-[18px] bg-amber-100 text-fleet-ember"><Gift className="h-7 w-7" /></span><h1 className="mt-5 text-3xl font-black text-fleet-night">You’re invited to Fast Fleets 360</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{message}</p>{message.includes("Checking") ? <Loader2 className="mx-auto mt-5 h-5 w-5 animate-spin text-fleet-ember" /> : null}</section></main>;
}
