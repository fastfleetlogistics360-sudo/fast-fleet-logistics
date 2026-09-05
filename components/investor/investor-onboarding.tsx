"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type OnboardingState = {
  investor: { code: string; status: string; onboardingCompleted: boolean };
  profile: { fullName: string; email: string; emailVerified: boolean; requiresPasswordSetup?: boolean };
  payout: { bankName?: string | null; accountName?: string | null; accountNumber?: string | null } | null;
};

export function InvestorOnboarding() {
  const [data, setData] = useState<OnboardingState | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [message, setMessage] = useState("Loading your secure activation…");
  const [saving, setSaving] = useState(false);
  const [forcePasswordSetup, setForcePasswordSetup] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    const type = params.get("type");
    if (tokenHash && (type === "invite" || type === "magiclink" || type === "recovery")) {
      void confirmInvitation(tokenHash, type);
      return;
    }
    void load();
    // The signed invitation is intentionally evaluated once; a re-render must
    // never attempt to consume the one-time token again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function confirmInvitation(tokenHash: string, type: "invite" | "magiclink" | "recovery") {
    setSaving(true);
    setMessage("Confirming your secure invitation…");
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) {
      setMessage("This invitation could not be confirmed. Ask FastFleets to resend it.");
      setSaving(false);
      return;
    }
    if (type === "recovery") setForcePasswordSetup(true);
    window.history.replaceState({}, "", "/investor/activate");
    await load();
    setSaving(false);
  }

  async function load() {
    const response = await fetch("/api/investor/onboarding");
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(result.error || "Could not load your investor account.");
      return;
    }
    setData(result);
    setFullName(result.profile?.fullName || "");
    setMessage("");
  }

  async function submit() {
    if (!data || saving) return;
    setSaving(true);
    setMessage("");
    try {
      if (!data.profile.emailVerified) throw new Error("Please open the verification link sent to your email before continuing.");
      if (data.profile.requiresPasswordSetup || forcePasswordSetup) {
        if (password.length < 10) throw new Error("Create a password with at least 10 characters.");
        const supabase = createClient();
        const passwordResult = await supabase.auth.updateUser({ password });
        if (passwordResult.error) throw passwordResult.error;
      }
      if (forcePasswordSetup) {
        setMessage("Your password has been updated. You can now sign in securely.");
        setForcePasswordSetup(false);
        return;
      }
      const response = await fetch("/api/investor/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, bankName, accountName, accountNumber })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not finish onboarding.");
      window.location.assign("/investor/dashboard");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not finish onboarding.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <Card className="mx-auto max-w-2xl p-5 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-700"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Investor activation</p>
            <h1 className="mt-1 text-2xl font-black text-fleet-night">Set up your bicycle assets account</h1>
            <p className="mt-2 text-sm font-semibold text-slate-600">A few small steps, then all of your bicycles will be in one secure place.</p>
          </div>
        </div>

        {data?.investor.onboardingCompleted && !forcePasswordSetup ? (
          <div className="mt-6 rounded-fleet bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />Your investor account is ready.</div>
        ) : forcePasswordSetup ? (
          <div className="mt-6 grid gap-4">
            <p className="rounded-fleet bg-fleet-paper p-4 text-sm font-semibold text-slate-600">Choose a new password for your FastFleets Investor Programme access. Your asset and payout details will stay unchanged.</p>
            <label className="form-field"><span className="form-label">New password</span><input className="form-input" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 10 characters" /></label>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Save new password</Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-4">
            <label className="form-field"><span className="form-label">Email</span><input className="form-input bg-slate-50" value={data?.profile.email || ""} readOnly /></label>
            <label className="form-field"><span className="form-label">Full name</span><input className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" /></label>
            {data?.profile.requiresPasswordSetup || forcePasswordSetup ? <label className="form-field"><span className="form-label">{forcePasswordSetup ? "New password" : "Create password"}</span><input className="form-input" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="new-password" placeholder="At least 10 characters" /></label> : <div className="rounded-fleet bg-fleet-paper p-4 text-sm font-semibold text-slate-600">You are using your existing FastFleets sign-in. Your password will not be changed.</div>}
            <div className="rounded-fleet border border-fleet-line bg-fleet-paper p-4"><strong className="text-sm text-fleet-night">Payout account</strong><p className="mt-1 text-xs font-semibold text-slate-600">Your details are stored securely for FastFleets admin to review before any future payout.</p></div>
            <label className="form-field"><span className="form-label">Bank name</span><input className="form-input" value={bankName} onChange={(event) => setBankName(event.target.value)} autoComplete="off" /></label>
            <label className="form-field"><span className="form-label">Account owner name</span><input className="form-input" value={accountName} onChange={(event) => setAccountName(event.target.value)} autoComplete="name" /></label>
            <label className="form-field"><span className="form-label">10-digit account number</span><input className="form-input" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" autoComplete="off" /></label>
            <Button type="button" onClick={submit} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}Finish secure setup</Button>
          </div>
        )}
        {message ? <p className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</p> : null}
      </Card>
    </section>
  );
}
