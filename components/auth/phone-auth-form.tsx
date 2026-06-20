"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Bike, Building2, Eye, EyeOff, KeyRound, Loader2, LockKeyhole, MapPinned, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeRole, parseUserRole, roleHome, safeDashboardRedirectForRole } from "@/lib/auth/roles";
import { readReturningProfile, saveReturningProfile, type ReturningProfile } from "@/lib/auth/returning-profile";
import type { UserRole } from "@/types/domain";
import { cn } from "@/lib/cn";
import { initials } from "@/lib/format";
import { uploadProfilePhoto } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { GoogleIcon } from "@/components/icons/social-icons";
import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";

const roleOptions: Array<{
  role: Exclude<UserRole, "admin">;
  label: string;
  body: string;
  icon: LucideIcon;
}> = [
  {
    role: "customer",
    label: "Customer",
    body: "Book deliveries, track orders, manage wallet, addresses, receipts, and support.",
    icon: UserRound
  },
  {
    role: "rider",
    label: "Rider",
    body: "Apply, upload documents, receive jobs, manage earnings, and request withdrawals.",
    icon: Bike
  },
  {
    role: "business",
    label: "Business",
    body: "Create vendor dispatch access, saved pickup points, bulk jobs, invoices, and team controls.",
    icon: Building2
  }
];

type AuthMode = "login" | "signup";

type PhoneAuthFormProps = {
  title?: string;
  description?: string;
  surface?: "card" | "plain";
  className?: string;
  defaultRole?: UserRole;
  lockedRole?: UserRole;
  returnToOverride?: string;
  intent?: AuthMode;
};

type ProfileRecord = {
  role?: UserRole | null;
  account_type?: UserRole | null;
};

function roleFromRequest(value: string | null): UserRole | undefined {
  return parseUserRole(value) || undefined;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function PhoneAuthForm({
  title = "Secure Fast Fleets 360 access",
  description = "Sign in with email and password or Google. Your account type is locked when you register.",
  surface = "card",
  className,
  defaultRole = "customer",
  lockedRole,
  returnToOverride,
  intent
}: PhoneAuthFormProps = {}) {
  const searchParams = useSearchParams();
  const requestedRole = roleFromRequest(searchParams.get("account") || searchParams.get("role"));
  const returnTo = searchParams.get("returnTo");
  const effectiveLockedRole = lockedRole || requestedRole;
  const requestedMode = searchParams.get("mode");
  const initialMode = intent || (requestedMode === "signup" ? "signup" : requestedMode === "login" ? "login" : effectiveLockedRole ? "signup" : "login");
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [role, setRole] = useState<UserRole>(effectiveLockedRole || defaultRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [fullName, setFullName] = useState("");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [customerState, setCustomerState] = useState("Lagos");
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<"google" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [returningProfile, setReturningProfile] = useState<ReturningProfile | null>(null);
  const [switchAccount, setSwitchAccount] = useState(false);

  const targetRoleHome = roleHome[role];
  const destination = returnToOverride || returnTo || "/hub";
  const safeDestination = destination.startsWith("/") && !destination.startsWith("//") ? destination : "/hub";
  const emailValid = isValidEmail(email);
  const passwordValid = password.trim().length >= 6;
  const nameValid = mode === "login" || fullName.trim().length >= 2;
  const profilePhotoValid = mode === "login" || Boolean(profilePhotoFile);
  const customerStateValid = mode === "login" || role !== "customer" || Boolean(normalizeState(customerState));
  const canSubmit = useMemo(() => {
    return emailValid && passwordValid && nameValid && profilePhotoValid && customerStateValid;
  }, [customerStateValid, emailValid, nameValid, passwordValid, profilePhotoValid]);

  function setError(key: string, error: string | null) {
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  }

  useEffect(() => {
    const error = searchParams.get("error_description") || searchParams.get("error");
    if (error && !message) setMessage(error);
  }, [message, searchParams]);

  useEffect(() => {
    if (effectiveLockedRole || mode !== "login") return;
    const cachedProfile = readReturningProfile();
    setReturningProfile(cachedProfile);
    if (cachedProfile?.email) setEmail((currentEmail) => currentEmail || cachedProfile.email || "");
  }, [effectiveLockedRole, mode]);

  function redirectForRole(userRole: UserRole) {
    const nextUrl = safeDashboardRedirectForRole(safeDestination, userRole);
    window.location.assign(nextUrl);
  }

  async function saveProfiles(
    userId: string,
    userRole: UserRole,
    fallbackEmail?: string | null,
    fallbackPhone?: string | null,
    avatarUrl?: string | null,
    displayName?: string | null
  ) {
    const now = new Date().toISOString();
    const supabase = createClient();
    const selectedState = userRole === "customer" ? normalizeState(customerState) || "Lagos" : "Lagos";
    const avatarPatch = avatarUrl ? { avatar_url: avatarUrl } : {};
    const profilePayload = {
      id: userId,
      user_id: userId,
      full_name: fullName.trim() || displayName || null,
      email: email.trim() || fallbackEmail || null,
      phone: fallbackPhone || null,
      account_type: userRole,
      lga: selectedState,
      updated_at: now
    };

    await Promise.allSettled([
      supabase.from("users").upsert({
        id: userId,
        full_name: profilePayload.full_name,
        phone: profilePayload.phone,
        email: profilePayload.email,
        ...avatarPatch,
        role: userRole,
        default_zone: selectedState,
        updated_at: now
      }),
      supabase.from("profiles").upsert({ ...profilePayload, ...avatarPatch })
    ]);

    saveReturningProfile({ fullName: profilePayload.full_name, email: profilePayload.email });
  }

  async function getSavedRole(userId: string, fallback: UserRole) {
    const supabase = createClient();
    const { data: profile } = await supabase.from("profiles").select("account_type").eq("user_id", userId).maybeSingle<ProfileRecord>();
    if (profile?.account_type) return normalizeRole(profile.account_type);

    const { data: user } = await supabase.from("users").select("role").eq("id", userId).maybeSingle<ProfileRecord>();
    return normalizeRole(user?.role || fallback);
  }

  async function createAccount() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(safeDestination)}&role=${encodeURIComponent(role)}`;
      const result = await supabase.auth.signUp({
        email: email.trim(),
        password: password.trim(),
        options: {
          emailRedirectTo: redirectTo,
          data: {
            role,
            account_type: role,
            full_name: fullName.trim(),
            default_zone: role === "customer" ? normalizeState(customerState) || "Lagos" : "Lagos",
            state: role === "customer" ? normalizeState(customerState) || "Lagos" : undefined
          }
        }
      });

      if (result.error) throw result.error;
      if (result.data.session && result.data.user) {
        const upload = profilePhotoFile ? await uploadProfilePhoto(result.data.user.id, profilePhotoFile) : null;
        await saveProfiles(
          result.data.user.id,
          role,
          result.data.user.email,
          result.data.user.phone,
          upload?.publicUrl || null,
          result.data.user.user_metadata?.full_name || fullName
        );
        redirectForRole(role);
        return;
      }
      setMode("login");
      setMessage("Account created. Check your email for the verification link, then sign in here.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create your account.");
    } finally {
      setLoading(false);
    }
  }

  async function loginWithPassword() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim()
      });
      if (result.error) throw result.error;
      if (!result.data.user) throw new Error("Login succeeded but no session was returned.");
      const userRole = await getSavedRole(result.data.user.id, normalizeRole(result.data.user.user_metadata?.account_type || result.data.user.user_metadata?.role || role));
      await saveProfiles(
        result.data.user.id,
        userRole,
        result.data.user.email,
        result.data.user.phone,
        null,
        result.data.user.user_metadata?.full_name || result.data.user.user_metadata?.name || null
      );
      redirectForRole(userRole);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle() {
    setOauthLoading("google");
    setMessage(null);
    try {
      const supabase = createClient();
      const roleParam = mode === "signup" || effectiveLockedRole ? `&role=${encodeURIComponent(role)}` : "";
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(safeDestination)}${roleParam}`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" },
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;
      if (!data.url) throw new Error("Could not start Google sign-in.");

      const check = await fetch("/api/auth/oauth-provider-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "google", url: data.url })
      });
      const status: { ok?: boolean; reason?: string | null } = await check.json().catch(() => ({}));
      if (!check.ok || !status.ok) {
        throw new Error(status.reason || "Google sign-in is not configured for this environment.");
      }

      window.location.assign(data.url);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not continue with Google.");
      setOauthLoading(null);
    }
  }

  async function resetPassword() {
    setLoading(true);
    setMessage(null);
    try {
      if (!emailValid) {
        setError("email", "Enter your email address first.");
        return;
      }
      const supabase = createClient();
      const redirectTo = typeof window === "undefined" ? undefined : `${window.location.origin}/auth?mode=reset`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMessage("Password reset email sent. Check your inbox for the secure link.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send a password reset email.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit || loading) return;
    if (mode === "signup") await createAccount();
    else await loginWithPassword();
  }

  const showReturningLogin = mode === "login" && Boolean(returningProfile?.email) && !switchAccount && !effectiveLockedRole;

  const returningContent = returningProfile ? (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[#050b13] p-5 text-white shadow-[0_24px_70px_rgba(2,6,8,0.34)] sm:p-7">
      <div className="flex items-center gap-3">
        <Image
          src="/brand/fastfleet-logo-2026-header.png"
          alt="Fast Fleets 360"
          width={48}
          height={48}
          className="h-12 w-12 rounded-fleet border border-white/15 bg-white object-cover p-1"
        />
        <span className="grid leading-none">
          <strong className="text-base font-black">Fast Fleets 360</strong>
          <span className="mt-1 text-[0.62rem] font-black uppercase tracking-[0.2em] text-fleet-gold">Secure access</span>
        </span>
      </div>

      <div className="mt-10">
        <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-gold">Returning user</span>
        <h1 className="mt-3 text-3xl font-black leading-tight sm:text-4xl">Welcome back, {returningProfile.firstName}</h1>
        <p className="mt-2 text-sm font-semibold leading-6 text-white/65">Enter your password to continue securely.</p>
      </div>

      <label className="form-field mt-7">
        <span className="form-label text-white/70">Password</span>
        <span className="relative">
          <input
            className="form-input border-white/15 bg-white/10 pr-12 text-white placeholder:text-white/35 focus:border-fleet-gold focus:ring-fleet-gold/20"
            value={password}
            onBlur={() => setError("password", passwordValid ? null : "Use at least 6 characters.")}
            onChange={(event) => {
              setPassword(event.target.value);
              if (fieldErrors.password) setError("password", null);
            }}
            placeholder="Your password"
            autoComplete="current-password"
            type={passwordVisible ? "text" : "password"}
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-fleet text-white/60 transition hover:bg-white/10 hover:text-white"
            onClick={() => setPasswordVisible((value) => !value)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
          >
            {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
        {fieldErrors.password ? <span className="text-xs font-bold text-red-300">{fieldErrors.password}</span> : null}
      </label>

      {message ? <div className="mt-5 rounded-fleet border border-amber-300/25 bg-amber-300/10 p-3 text-sm font-bold leading-6 text-amber-100">{message}</div> : null}

      <div className="mt-7 grid gap-3">
        <Button type="button" disabled={!emailValid || !passwordValid || loading} onClick={loginWithPassword} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          SIGN IN
        </Button>
        <button type="button" onClick={resetPassword} disabled={loading} className="text-sm font-black text-fleet-gold transition hover:text-white disabled:opacity-50">
          Forgot Password
        </button>
        <button
          type="button"
          onClick={() => {
            setSwitchAccount(true);
            setReturningProfile(null);
            setEmail("");
            setPassword("");
            setMessage(null);
          }}
          className="text-sm font-bold text-white/60 transition hover:text-white"
        >
          Not {returningProfile.firstName}? Switch account
        </button>
      </div>
    </div>
  ) : null;

  const standardContent = (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge tone="blue">{mode === "signup" ? "Account registration" : "Secure sign-in"}</StatusBadge>
          <h1 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">{title}</h1>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{description}</p>
          {effectiveLockedRole ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-fleet-navy px-3 py-1 text-xs font-black uppercase tracking-[0.14em] text-white">
              <LockKeyhole className="h-3.5 w-3.5" />
              {effectiveLockedRole === "rider" ? "Rider account locked" : `${effectiveLockedRole} account locked`}
            </div>
          ) : null}
        </div>
        <span className="hidden h-12 w-12 place-items-center rounded-fleet bg-fleet-navy text-white sm:grid">
          <ShieldCheck className="h-5 w-5" />
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-fleet bg-fleet-paper p-1">
        {(["login", "signup"] as const).map((option) => (
          <button
            key={option}
            type="button"
            className={cn("rounded-fleet px-3 py-2 text-sm font-black transition", mode === option ? "bg-white text-fleet-night shadow-lift" : "text-slate-500")}
            onClick={() => {
              setMode(option);
              setMessage(null);
            }}
          >
            {option === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      {mode === "signup" ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {roleOptions.filter((option) => !effectiveLockedRole || option.role === effectiveLockedRole).map((option) => {
            const Icon = option.icon;
            const selected = role === option.role;
            return (
              <button
                key={option.role}
                type="button"
                className={cn(
                  "rounded-fleet border p-3 text-left transition",
                  selected ? "border-fleet-navy bg-fleet-navy text-white shadow-lift" : "border-fleet-line bg-white text-fleet-night hover:border-fleet-gold"
                )}
                onClick={() => {
                  if (!effectiveLockedRole) setRole(option.role);
                }}
                disabled={Boolean(effectiveLockedRole)}
              >
                <Icon className="h-5 w-5" />
                <strong className="mt-3 block text-sm font-black">{option.label}</strong>
                <span className={cn("mt-2 block text-xs font-semibold leading-5", selected ? "text-white/80" : "text-slate-600")}>{option.body}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mt-6 grid gap-4">
        {mode === "signup" ? (
          <label className="form-field">
            <span className="form-label">Full name</span>
            <input
              className="form-input"
              value={fullName}
              onBlur={() => setError("fullName", fullName.trim().length >= 2 ? null : "Enter your full name.")}
              onChange={(event) => {
                setFullName(event.target.value);
                if (fieldErrors.fullName) setError("fullName", null);
              }}
              placeholder="Adewale Johnson"
              autoComplete="name"
            />
            {fieldErrors.fullName ? <span className="text-xs font-bold text-red-600">{fieldErrors.fullName}</span> : null}
          </label>
        ) : null}

        {mode === "signup" ? (
          <label className="form-field">
            <span className="form-label">Profile picture</span>
            <span className="flex items-center gap-3 rounded-fleet border border-fleet-line bg-white p-3">
              <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-fleet-navy text-sm font-black text-white">
                {profilePhotoFile ? <UserRound className="h-5 w-5" /> : initials(fullName || "User")}
              </span>
              <span className="min-w-0 flex-1 text-sm font-bold text-slate-600">{profilePhotoFile?.name || "Upload a clear face photo for account identity."}</span>
              <span className="rounded-fleet bg-fleet-paper px-3 py-2 text-xs font-black text-fleet-night">Choose</span>
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  setProfilePhotoFile(event.target.files?.[0] || null);
                  if (fieldErrors.profilePhoto) setError("profilePhoto", null);
                }}
              />
            </span>
            {!profilePhotoValid ? <span className="text-xs font-bold text-red-600">Upload a profile picture.</span> : null}
            {fieldErrors.profilePhoto ? <span className="text-xs font-bold text-red-600">{fieldErrors.profilePhoto}</span> : null}
          </label>
        ) : null}

        {mode === "signup" && role === "customer" ? (
          <label className="form-field">
            <span className="form-label">Select Your State</span>
            <span className="relative">
              <MapPinned className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fleet-ember" />
              <select
                className="form-input pl-10"
                value={customerState}
                onBlur={() => setError("customerState", customerStateValid ? null : "Select your state.")}
                onChange={(event) => {
                  setCustomerState(event.target.value);
                  if (fieldErrors.customerState) setError("customerState", null);
                }}
                required
              >
                {NIGERIAN_STATES.map((state) => (
                  <option key={state} value={state}>{state}</option>
                ))}
              </select>
            </span>
            <span className="text-xs font-bold leading-5 text-slate-500">
              Live states are controlled from admin. Other states receive early-access dashboard access while rollout expands.
            </span>
            {fieldErrors.customerState ? <span className="text-xs font-bold text-red-600">{fieldErrors.customerState}</span> : null}
          </label>
        ) : null}

        <label className="form-field">
          <span className="form-label">Email</span>
          <input
            className="form-input"
            value={email}
            onBlur={() => setError("email", emailValid ? null : "Enter a valid email address.")}
            onChange={(event) => {
              setEmail(event.target.value);
              if (fieldErrors.email) setError("email", null);
            }}
            placeholder="you@example.com"
            autoComplete="email"
            inputMode="email"
          />
          {fieldErrors.email ? <span className="text-xs font-bold text-red-600">{fieldErrors.email}</span> : null}
        </label>
        <label className="form-field">
          <span className="form-label">Password</span>
          <span className="relative">
            <input
              className="form-input pr-12"
              value={password}
              onBlur={() => setError("password", passwordValid ? null : "Use at least 6 characters.")}
              onChange={(event) => {
                setPassword(event.target.value);
                if (fieldErrors.password) setError("password", null);
              }}
              placeholder="Minimum 6 characters"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              type={passwordVisible ? "text" : "password"}
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
          {fieldErrors.password ? <span className="text-xs font-bold text-red-600">{fieldErrors.password}</span> : null}
        </label>
      </div>

      {message ? <div className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}

      <div className="mt-6 grid gap-3">
        <Button type="button" disabled={!canSubmit || loading} onClick={handleSubmit} className="w-full bg-fleet-navy hover:bg-fleet-night">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {mode === "signup" ? "Create account" : "Sign in"}
        </Button>
        <Button type="button" variant="secondary" onClick={continueWithGoogle} disabled={loading || Boolean(oauthLoading)} className="w-full">
          {oauthLoading === "google" ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Continue with Google
        </Button>
        {mode === "login" ? (
          <button type="button" onClick={resetPassword} disabled={loading} className="inline-flex items-center justify-center gap-2 text-sm font-black text-fleet-navy hover:text-fleet-ember disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            Forgot password
          </button>
        ) : null}
      </div>
    </>
  );

  const content = showReturningLogin ? returningContent : standardContent;

  if (surface === "plain") return <div className={cn("p-0", className)}>{content}</div>;
  if (showReturningLogin) return <div className={className}>{content}</div>;
  return <Card className={cn("p-4 sm:p-6", className)}>{content}</Card>;
}
