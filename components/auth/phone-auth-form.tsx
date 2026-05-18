"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, Building2, LockKeyhole, Loader2, MailCheck, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeRole, roleHome } from "@/lib/auth/roles";
import { NIGERIAN_STATES } from "@/lib/launch-states";
import type { UserRole } from "@/types/domain";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { AppleIcon, GoogleIcon } from "@/components/icons/social-icons";

const roleOptions: Array<{
  role: UserRole;
  label: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    role: "customer",
    label: "Continue as Customer",
    body: "Book deliveries, track orders, manage wallet, addresses, receipts, and support.",
    icon: UserRound
  },
  {
    role: "rider",
    label: "Become a Delivery Partner",
    body: "Apply, upload documents, receive jobs, manage earnings, and request withdrawals.",
    icon: Bike
  },
  {
    role: "business",
    label: "Register a Business",
    body: "Create vendor dispatch access, saved pickup points, bulk jobs, invoices, and team controls.",
    icon: Building2
  }
];

type PhoneAuthFormProps = {
  title?: string;
  description?: string;
  surface?: "card" | "plain";
  className?: string;
  defaultRole?: UserRole;
  lockedRole?: UserRole;
  returnToOverride?: string;
  intent?: "signup" | "login";
};

export function PhoneAuthForm({
  title = "Secure FastFleet access",
  description = "Create or access your account with email verification. Drivers continue to dashboard and KYC after login.",
  surface = "card",
  className,
  defaultRole = "customer",
  lockedRole,
  returnToOverride,
  intent
}: PhoneAuthFormProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const requestedAccount = searchParams.get("account") || searchParams.get("role");
  const requestedRole: UserRole | undefined =
    requestedAccount === "driver" || requestedAccount === "rider"
      ? "rider"
      : requestedAccount === "business"
        ? "business"
        : requestedAccount === "admin"
          ? "admin"
          : undefined;
  const effectiveLockedRole = lockedRole || requestedRole;
  const [mode, setMode] = useState<"signup" | "login">(intent || (effectiveLockedRole ? "signup" : "login"));
  const [role, setRole] = useState<UserRole>(effectiveLockedRole || defaultRole);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [state, setState] = useState("Lagos");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const targetRoleHome = roleHome[role];
  const canSubmit = useMemo(
    () =>
      email.trim().includes("@") &&
      password.trim().length >= 6 &&
      (mode === "login" || (phone.trim().length >= 10 && fullName.trim().length >= 2 && state.trim().length > 0)),
    [email, fullName, mode, password, phone, state]
  );

  async function createAccount() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnToOverride || returnTo || targetRoleHome)}`;
      const result = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          emailRedirectTo: redirectTo,
          data: {
            role,
            account_type: role,
            full_name: fullName.trim(),
            email: email.trim(),
            state,
            default_zone: state,
            launch_state: state
          }
        }
      });

      if (result.error) throw result.error;
      if (result.data.session && result.data.user) {
        await saveUserProfile(result.data.user.id, role);
        router.replace(returnToOverride || returnTo || targetRoleHome);
        router.refresh();
        return;
      }
      setMode("login");
      setMessage("Account created. Check your email, verify it, then sign in here to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create account. Check your Supabase email settings.");
    } finally {
      setLoading(false);
    }
  }

  async function login() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });

      if (result.error) throw result.error;
      if (!result.data.user) throw new Error("Login succeeded but no user session was returned.");
      const profileResult = await supabase.from("users").select("role").eq("id", result.data.user.id).maybeSingle();
      const userRole = normalizeRole(profileResult.data?.role || result.data.user.user_metadata?.role || role);
      await saveUserProfile(result.data.user.id, userRole);

      router.replace(returnToOverride || returnTo || roleHome[userRole]);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed. Verify your email and check your password.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithProvider(provider: "google" | "apple") {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(returnToOverride || returnTo || targetRoleHome)}&role=${encodeURIComponent(role)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams: provider === "google" ? { access_type: "offline", prompt: "consent" } : undefined
        }
      });

      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : `Could not continue with ${provider === "google" ? "Google" : "Apple"}.`);
      setLoading(false);
    }
  }

  async function saveUserProfile(userId: string, userRole: UserRole) {
    const supabase = createClient();
    const payload: {
      id: string;
      email: string;
      role: UserRole;
      updated_at: string;
      full_name?: string;
      phone?: string | null;
      default_zone?: string;
    } = {
      id: userId,
      email: email.trim(),
      role: userRole,
      updated_at: new Date().toISOString()
    };
    if (fullName.trim()) payload.full_name = fullName.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (state.trim()) payload.default_zone = state;
    await supabase.from("users").upsert(payload);
  }

  async function signOut() {
    setLoading(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
      setMessage("Signed out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sign out.");
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge tone="blue">{mode === "signup" ? "Email verification" : "Secure login"}</StatusBadge>
          <h1 className="mt-3 pr-12 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            {description}
          </p>
          {effectiveLockedRole ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-fleet-night px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
              <LockKeyhole className="h-3.5 w-3.5" />
              {effectiveLockedRole === "rider" ? "Driver account pre-picked" : `${effectiveLockedRole} account pre-picked`}
            </div>
          ) : null}
        </div>
        <span className="hidden h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white sm:grid">
          <ShieldCheck className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-fleet bg-fleet-paper p-1">
        <button
          type="button"
          className={cn("rounded-fleet px-3 py-2 text-sm font-black transition", mode === "signup" ? "bg-white text-fleet-night shadow-lift" : "text-slate-500")}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
        <button
          type="button"
          className={cn("rounded-fleet px-3 py-2 text-sm font-black transition", mode === "login" ? "bg-white text-fleet-night shadow-lift" : "text-slate-500")}
          onClick={() => setMode("login")}
        >
          Sign in
        </button>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => continueWithProvider("google")}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-line bg-white px-4 text-sm font-black text-fleet-night shadow-[0_12px_26px_rgba(8,17,31,0.06)] transition hover:-translate-y-0.5 hover:border-fleet-gold disabled:pointer-events-none disabled:opacity-55"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Continue with Google
        </button>
        <button
          type="button"
          onClick={() => continueWithProvider("apple")}
          disabled={loading}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-fleet border border-fleet-night bg-fleet-night px-4 text-sm font-black text-white shadow-[0_12px_26px_rgba(8,17,31,0.14)] transition hover:-translate-y-0.5 hover:bg-[#10233a] disabled:pointer-events-none disabled:opacity-55"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon className="h-4 w-4" />}
          Continue with Apple
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {roleOptions.filter((option) => !effectiveLockedRole || option.role === effectiveLockedRole).map((option) => {
          const Icon = option.icon;
          const selected = role === option.role;

          return (
            <button
              key={option.role}
              type="button"
              className={`rounded-fleet border p-4 text-left transition ${
                selected ? "border-fleet-ember bg-orange-50 shadow-lift" : "border-fleet-line bg-white hover:border-fleet-gold"
              }`}
              onClick={() => {
                if (!effectiveLockedRole) setRole(option.role);
              }}
              disabled={Boolean(effectiveLockedRole)}
            >
              <Icon className={selected ? "h-5 w-5 text-fleet-ember" : "h-5 w-5 text-fleet-night"} />
              <strong className="mt-4 block text-sm font-black text-fleet-night">{option.label}</strong>
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-600">{option.body}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4">
        <label className="form-field">
          <span className="form-label">Email</span>
          <input className="form-input" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
        </label>
        <label className="form-field">
          <span className="form-label">Password</span>
          <input className="form-input" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Minimum 6 characters" autoComplete={mode === "signup" ? "new-password" : "current-password"} type="password" />
        </label>
        {mode === "signup" ? (
          <>
            <label className="form-field">
              <span className="form-label">Full name</span>
              <input className="form-input" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Adewale Johnson" autoComplete="name" />
            </label>
            <label className="form-field">
              <span className="form-label">Phone number</span>
              <input className="form-input" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+2348012345678" autoComplete="tel" inputMode="tel" />
            </label>
            <label className="form-field">
              <span className="form-label">State</span>
              <select className="form-input" value={state} onChange={(event) => setState(event.target.value)}>
                {NIGERIAN_STATES.map((stateOption) => (
                  <option key={stateOption} value={stateOption}>
                    {stateOption}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
        {mode === "login" && effectiveLockedRole ? (
          <label className="form-field">
            <span className="form-label">Account type</span>
            <input
              className="form-input"
              value={effectiveLockedRole === "rider" ? "Driver" : effectiveLockedRole[0].toUpperCase() + effectiveLockedRole.slice(1)}
              readOnly
            />
          </label>
        ) : null}
        {mode === "signup" ? (
          <div className="rounded-fleet border border-blue-100 bg-blue-50 p-3 text-xs font-bold leading-5 text-blue-800">
            After creating the account, Supabase sends a verification email. Once verified, sign in and FastFleet sends you to the correct dashboard automatically.
          </div>
        ) : null}
        {mode === "login" ? (
          <div className="rounded-fleet border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
            Login uses your saved role, so drivers open the Driver Dashboard and businesses open the Business Dashboard.
          </div>
        ) : null}
        {false ? (
          <label className="form-field">
            <span className="form-label">OTP code</span>
            <input className="form-input text-center text-xl tracking-[0.4em]" value="" readOnly placeholder="000000" inputMode="numeric" maxLength={6} />
          </label>
        ) : null}
      </div>

      {message ? (
        <div className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">
          {message}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
        {mode === "signup" ? (
          <Button type="button" disabled={!canSubmit || loading} onClick={createAccount}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailCheck className="h-4 w-4" />}
            Create account
          </Button>
        ) : (
          <Button type="button" disabled={!canSubmit || loading} onClick={login}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Sign in
          </Button>
        )}
        <Button type="button" variant="secondary" onClick={signOut} disabled={loading}>
          Logout
        </Button>
      </div>
    </>
  );

  if (surface === "plain") {
    return <div className={cn("p-0", className)}>{content}</div>;
  }

  return <Card className={cn("p-4 sm:p-6", className)}>{content}</Card>;
}
