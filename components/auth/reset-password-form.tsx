"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [ready, setReady] = useState(false);
  const [validLink, setValidLink] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void createClient().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setValidLink(Boolean(data.user) && !error);
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setValidLink(false);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function savePassword() {
    if (password.length < 8) {
      setMessage("Choose a password with at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setMessage("Your new passwords do not match.");
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) throw error;
      await createClient().auth.signOut();
      setMessage("Your password has been updated. You can now sign in with it.");
      setPassword("");
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Your password could not be updated. Please request another reset email.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-fleet-navy text-white"><ShieldCheck className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-fleet-ember">Secure account access</p>
          <h1 className="mt-1 text-2xl font-black text-fleet-night sm:text-3xl">Create a new password</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">Choose a new password for your FastFleets 360 account.</p>
        </div>
      </div>

      {!ready ? <p className="mt-6 text-sm font-bold text-slate-600">Checking your secure reset link…</p> : null}
      {ready && !validLink ? <div className="mt-6 rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">This password-reset link is invalid or has expired. Request a new one from <Link className="text-fleet-ember underline" href="/auth">sign in</Link>.</div> : null}
      {ready && validLink ? <div className="mt-6 grid gap-4">
        <label className="form-field"><span className="form-label">New password</span><input className="form-input" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
        <label className="form-field"><span className="form-label">Confirm new password</span><input className="form-input" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Repeat your new password" /></label>
        {message ? <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}
        <Button type="button" className="w-full bg-fleet-navy hover:bg-fleet-night" disabled={saving} onClick={savePassword}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Save new password</Button>
      </div> : null}
      {message && (!ready || !validLink) ? <div className="mt-5 rounded-[14px] border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}
    </Card>
  );
}
