"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

export function AdminLogin() {
  const router = useRouter();
  const [username, setUsername] = useState("FastFleetAdmin");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Admin login failed.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Admin login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="min-h-screen bg-fleet-night px-4 py-8 text-white sm:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-6xl items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-fleet-gold">
            <ShieldCheck className="h-4 w-4" />
            Private command center
          </div>
          <h1 className="mt-6 max-w-2xl text-4xl font-black leading-tight sm:text-6xl">
            FastFleet admin environment
          </h1>
          <p className="mt-5 max-w-xl text-sm font-semibold leading-7 text-white/70">
            Protected access for launch controls, rider reviews, withdrawals, pricing, site operations, and company transaction records.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Finance", "Income and expense logs"],
              ["Operations", "Riders, routes, payouts"],
              ["Governance", "States, pricing, audit flow"]
            ].map(([label, helper]) => (
              <div key={label} className="rounded-fleet border border-white/10 bg-white/10 p-4">
                <strong className="block text-sm font-black">{label}</strong>
                <span className="mt-1 block text-xs font-bold leading-5 text-white/76">{helper}</span>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-white/15 bg-white p-5 text-fleet-ink shadow-[0_28px_90px_rgba(0,0,0,0.3)] sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <StatusBadge tone="blue">Admin login</StatusBadge>
              <h2 className="mt-4 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Sign in to continue</h2>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
                Use the dedicated admin credentials already configured for this project.
              </p>
            </div>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-fleet bg-fleet-night text-white">
              <LockKeyhole className="h-5 w-5" />
            </span>
          </div>

          <div className="mt-6 grid gap-4">
            <label className="form-field">
              <span className="form-label">Username</span>
              <span className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className="form-input pl-10" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
              </span>
            </label>
            <label className="form-field">
              <span className="form-label">Password</span>
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  className="form-input px-10"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={passwordVisible ? "text" : "password"}
                  autoComplete="current-password"
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && username.trim() && password.trim() && !loading) void signIn();
                  }}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-fleet text-slate-500 transition hover:bg-fleet-paper hover:text-fleet-night"
                  onClick={() => setPasswordVisible((value) => !value)}
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </span>
            </label>
          </div>

          {message ? <div className="mt-5 rounded-fleet bg-rose-50 p-3 text-sm font-bold text-rose-700">{message}</div> : null}

          <Button type="button" className="mt-6 w-full" onClick={signIn} disabled={loading || !username.trim() || !password.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
            Enter admin
          </Button>
        </Card>
      </div>
    </section>
  );
}
