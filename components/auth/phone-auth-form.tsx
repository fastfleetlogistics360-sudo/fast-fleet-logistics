"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bike, Building2, KeyRound, Loader2, LockKeyhole, MailCheck, Phone, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { normalizeRole, roleHome } from "@/lib/auth/roles";
import type { UserRole } from "@/types/domain";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { GoogleIcon } from "@/components/icons/social-icons";

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
type AuthMethod = "email" | "phone";

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
  if (value === "driver" || value === "rider") return "rider";
  if (value === "business") return "business";
  if (value === "admin") return "admin";
  if (value === "customer") return "customer";
  return undefined;
}

function formatNigerianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "+234";
  if (digits.startsWith("234")) return `+${digits.slice(0, 13)}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1, 11)}`;
  return `+234${digits.slice(0, 10)}`;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidNigerianPhone(value: string) {
  return /^\+234[789][01]\d{8}$/.test(value.trim());
}

export function PhoneAuthForm({
  title = "Secure FastFleet access",
  description = "Sign in with email and password, phone OTP, or Google. Your account type is locked when you register.",
  surface = "card",
  className,
  defaultRole = "customer",
  lockedRole,
  returnToOverride,
  intent
}: PhoneAuthFormProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRole = roleFromRequest(searchParams.get("account") || searchParams.get("role"));
  const returnTo = searchParams.get("returnTo");
  const effectiveLockedRole = lockedRole || requestedRole;
  const [mode, setMode] = useState<AuthMode>(intent || (effectiveLockedRole ? "signup" : "login"));
  const [method, setMethod] = useState<AuthMethod>("email");
  const [role, setRole] = useState<UserRole>(effectiveLockedRole || defaultRole);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+234");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const targetRoleHome = roleHome[role];
  const destination = returnToOverride || returnTo || targetRoleHome;
  const safeDestination = destination.startsWith("/") && !destination.startsWith("//") ? destination : targetRoleHome;
  const emailValid = isValidEmail(email);
  const phoneValid = isValidNigerianPhone(phone);
  const passwordValid = password.trim().length >= 6;
  const nameValid = mode === "login" || fullName.trim().length >= 2;
  const canSubmit = useMemo(() => {
    if (method === "phone") return phoneValid && (otpSent ? /^\d{6}$/.test(otp.trim()) : true) && nameValid;
    return emailValid && passwordValid && nameValid;
  }, [emailValid, method, nameValid, otp, otpSent, passwordValid, phoneValid]);

  function setError(key: string, error: string | null) {
    setFieldErrors((previous) => {
      const next = { ...previous };
      if (error) next[key] = error;
      else delete next[key];
      return next;
    });
  }

  function redirectForRole(userRole: UserRole) {
    router.replace(returnToOverride || returnTo || roleHome[userRole]);
    router.refresh();
  }

  async function saveProfiles(userId: string, userRole: UserRole, fallbackEmail?: string | null, fallbackPhone?: string | null) {
    const now = new Date().toISOString();
    const supabase = createClient();
    const profilePayload = {
      id: userId,
      user_id: userId,
      full_name: fullName.trim() || null,
      email: email.trim() || fallbackEmail || null,
      phone: phoneValid ? phone.trim() : fallbackPhone || null,
      account_type: userRole,
      updated_at: now
    };

    await Promise.allSettled([
      supabase.from("users").upsert({
        id: userId,
        full_name: profilePayload.full_name,
        phone: profilePayload.phone,
        email: profilePayload.email,
        role: userRole,
        default_zone: "Lagos",
        updated_at: now
      }),
      supabase.from("profiles").upsert(profilePayload)
    ]);
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
            phone: phoneValid ? phone.trim() : undefined,
            default_zone: "Lagos"
          }
        }
      });

      if (result.error) throw result.error;
      if (result.data.session && result.data.user) {
        await saveProfiles(result.data.user.id, role, result.data.user.email, result.data.user.phone);
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
      await saveProfiles(result.data.user.id, userRole, result.data.user.email, result.data.user.phone);
      redirectForRole(userRole);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Login failed. Check your email and password.");
    } finally {
      setLoading(false);
    }
  }

  async function sendOtp() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(safeDestination)}&role=${encodeURIComponent(role)}`;
      const result = await supabase.auth.signInWithOtp({
        phone: phone.trim(),
        options: {
          shouldCreateUser: mode === "signup",
          data: {
            role,
            account_type: role,
            full_name: fullName.trim(),
            default_zone: "Lagos"
          },
          channel: "sms",
          emailRedirectTo: redirectTo
        }
      });
      if (result.error) throw result.error;
      setOtpSent(true);
      setMessage("OTP sent. Enter the 6-digit code to continue.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not send OTP. Check the phone number.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const result = await supabase.auth.verifyOtp({
        phone: phone.trim(),
        token: otp.trim(),
        type: "sms"
      });
      if (result.error) throw result.error;
      if (!result.data.user) throw new Error("OTP verified but no session was returned.");
      const userRole = mode === "signup" ? role : await getSavedRole(result.data.user.id, role);
      await saveProfiles(result.data.user.id, userRole, result.data.user.email, result.data.user.phone);
      redirectForRole(userRole);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "OTP verification failed.");
    } finally {
      setLoading(false);
    }
  }

  async function continueWithGoogle() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const redirectTo =
        typeof window === "undefined"
          ? undefined
          : `${window.location.origin}/auth/callback?returnTo=${encodeURIComponent(safeDestination)}&role=${encodeURIComponent(role)}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { access_type: "offline", prompt: "consent" }
        }
      });
      if (error) throw error;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not continue with Google.");
      setLoading(false);
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
    if (method === "phone") {
      if (otpSent) await verifyOtp();
      else await sendOtp();
      return;
    }
    if (mode === "signup") await createAccount();
    else await loginWithPassword();
  }

  const content = (
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
              setOtpSent(false);
            }}
          >
            {option === "login" ? "Sign in" : "Register"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {([
          ["email", MailCheck, "Email"],
          ["phone", Phone, "Phone OTP"]
        ] as const).map(([option, Icon, label]) => (
          <button
            key={option}
            type="button"
            className={cn(
              "inline-flex min-h-11 items-center justify-center gap-2 rounded-fleet border px-3 text-sm font-black transition",
              method === option ? "border-fleet-navy bg-fleet-navy text-white" : "border-fleet-line bg-white text-fleet-night hover:border-fleet-gold"
            )}
            onClick={() => {
              setMethod(option);
              setMessage(null);
              setOtpSent(false);
            }}
          >
            <Icon className="h-4 w-4" />
            {label}
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

        {method === "email" ? (
          <>
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
              <input
                className="form-input"
                value={password}
                onBlur={() => setError("password", passwordValid ? null : "Use at least 6 characters.")}
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (fieldErrors.password) setError("password", null);
                }}
                placeholder="Minimum 6 characters"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                type="password"
              />
              {fieldErrors.password ? <span className="text-xs font-bold text-red-600">{fieldErrors.password}</span> : null}
            </label>
          </>
        ) : (
          <>
            <label className="form-field">
              <span className="form-label">Phone number</span>
              <input
                className="form-input"
                value={phone}
                onBlur={() => setError("phone", phoneValid ? null : "Use a Nigerian number like +2348012345678.")}
                onChange={(event) => {
                  setPhone(formatNigerianPhone(event.target.value));
                  if (fieldErrors.phone) setError("phone", null);
                }}
                placeholder="+2348012345678"
                autoComplete="tel"
                inputMode="tel"
              />
              {fieldErrors.phone ? <span className="text-xs font-bold text-red-600">{fieldErrors.phone}</span> : null}
            </label>
            {otpSent ? (
              <label className="form-field">
                <span className="form-label">OTP code</span>
                <input
                  className="form-input text-center text-xl tracking-[0.35em]"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
            ) : null}
          </>
        )}
      </div>

      {message ? <div className="mt-5 rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}

      <div className="mt-6 grid gap-3">
        <Button type="button" disabled={!canSubmit || loading} onClick={handleSubmit} className="w-full bg-fleet-navy hover:bg-fleet-night">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : method === "phone" ? <Phone className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
          {method === "phone" ? (otpSent ? "Verify OTP" : "Send OTP") : mode === "signup" ? "Create account" : "Sign in"}
        </Button>
        <Button type="button" variant="secondary" onClick={continueWithGoogle} disabled={loading} className="w-full">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-4 w-4" />}
          Continue with Google
        </Button>
        {mode === "login" && method === "email" ? (
          <button type="button" onClick={resetPassword} disabled={loading} className="inline-flex items-center justify-center gap-2 text-sm font-black text-fleet-navy hover:text-fleet-ember disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            Forgot password
          </button>
        ) : null}
      </div>
    </>
  );

  if (surface === "plain") return <div className={cn("p-0", className)}>{content}</div>;
  return <Card className={cn("p-4 sm:p-6", className)}>{content}</Card>;
}
