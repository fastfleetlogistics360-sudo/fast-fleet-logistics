"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, PackageCheck, Store, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

type BusinessRegistrationStatus = "submitted" | "active" | "paused" | "rejected";

export function BusinessRegistrationFlow() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<BusinessRegistrationStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    industry: "Retail and ecommerce",
    dispatchVolume: "10 - 30 weekly deliveries",
    pickupAddress: ""
  });

  const complete = useMemo(
    () => form.businessName.trim().length > 2 && form.contactName.trim().length > 1 && form.phone.trim().length >= 10 && form.pickupAddress.trim().length > 4,
    [form]
  );

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setSignedIn(Boolean(data.user));
        setAuthReady(true);
        if (data.user) {
          supabase
            .from("business_profiles")
            .select("business_name, contact_name, phone, email, industry, dispatch_volume, pickup_address, registration_status, rejection_reason")
            .eq("user_id", data.user.id)
            .maybeSingle<{
              business_name?: string | null;
              contact_name?: string | null;
              phone?: string | null;
              email?: string | null;
              industry?: string | null;
              dispatch_volume?: string | null;
              pickup_address?: string | null;
              registration_status?: BusinessRegistrationStatus | null;
              rejection_reason?: string | null;
            }>()
            .then(async ({ data: business, error }) => {
              if (error) {
                const fallback = await supabase
                  .from("business_profiles")
                  .select("business_name, contact_name, phone, email, industry, dispatch_volume, pickup_address, registration_status")
                  .eq("user_id", data.user.id)
                  .maybeSingle<{
                    business_name?: string | null;
                    contact_name?: string | null;
                    phone?: string | null;
                    email?: string | null;
                    industry?: string | null;
                    dispatch_volume?: string | null;
                    pickup_address?: string | null;
                    registration_status?: BusinessRegistrationStatus | null;
                  }>();
                business = fallback.data ? { ...fallback.data, rejection_reason: null } : null;
              }
              if (!business) return;
              setForm((current) => ({
                ...current,
                businessName: business.business_name || current.businessName,
                contactName: business.contact_name || current.contactName,
                phone: business.phone || current.phone,
                email: business.email || data.user.email || current.email,
                industry: business.industry || current.industry,
                dispatchVolume: business.dispatch_volume || current.dispatchVolume,
                pickupAddress: business.pickup_address || current.pickupAddress
              }));
              setRegistrationStatus(business.registration_status || null);
              setRejectionReason(business.rejection_reason || null);
              if (business.registration_status && business.registration_status !== "rejected") setSubmitted(true);
            });
        }
      });
    } catch {
      setAuthReady(true);
    }
  }, []);

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitBusiness() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setSignedIn(false);
        return;
      }

      await supabase.from("users").upsert({
        id: user.id,
        full_name: form.contactName,
        phone: form.phone,
        email: form.email || user.email || null,
        role: "business",
        updated_at: new Date().toISOString()
      });

      const { error } = await supabase.from("business_profiles").upsert(
        {
          user_id: user.id,
          business_name: form.businessName,
          contact_name: form.contactName,
          phone: form.phone,
          email: form.email || user.email || null,
          industry: form.industry,
          dispatch_volume: form.dispatchVolume,
          pickup_address: form.pickupAddress,
          registration_status: "submitted",
          updated_at: new Date().toISOString()
        },
        { onConflict: "user_id" }
      );
      if (error) throw error;
      setRegistrationStatus("submitted");
      setRejectionReason(null);
      setSubmitted(true);
    } catch {
      window.localStorage.setItem("fastfleet.next.business_registration", JSON.stringify({ form, registration_status: "submitted", created_at: new Date().toISOString() }));
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (!authReady) return <Card className="mx-auto h-96 max-w-3xl animate-pulse bg-white" />;

  if (!signedIn) {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Business registration</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Register your business.</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            This creates a FastFleet business account first, then opens the vendor setup for pickup points, bulk delivery tools, wallet records, and dispatch support.
          </p>
          <div className="mt-5 grid gap-3 rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-600">
            <span>Business dashboard access</span>
            <span>Saved pickup and vendor dispatch settings</span>
            <span>Bulk bookings, receipts, and support visibility</span>
          </div>
        </Card>
        <PhoneAuthForm
          title="Create business account"
          description="Create your business account with email verification. After login, you will finish the business dispatch profile on this page."
          defaultRole="business"
          lockedRole="business"
          returnToOverride="/business/register"
          intent="signup"
        />
      </div>
    );
  }

  if (submitted && registrationStatus !== "rejected") {
    return (
      <Card className="mx-auto max-w-3xl p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <StatusBadge tone={registrationStatus === "active" ? "green" : "amber"} className="mt-5">
          {registrationStatus === "active" ? "KYC approved" : "KYC pending"}
        </StatusBadge>
        <h1 className="mt-3 text-3xl font-black text-fleet-night sm:text-4xl">
          {registrationStatus === "active" ? "Your business dashboard is ready." : "Your business KYC is under review."}
        </h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {registrationStatus === "active"
            ? "Your business account has been approved by FastFleet operations."
            : "FastFleet admin will review your business profile. Your dashboard will show pending status until it is approved."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/business/dashboard" variant="secondary">
            {registrationStatus === "active" ? "Open business dashboard" : "View pending dashboard"}
          </LinkButton>
          {registrationStatus === "active" ? <LinkButton href="/book">Book a delivery</LinkButton> : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-5">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Vendor setup</span>
        <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Business dispatch profile.</h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Add your company details so FastFleet can tailor pickup, billing, support, and bulk dispatch workflows.
        </p>
        {registrationStatus === "rejected" ? (
          <div className="mt-5 rounded-fleet border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
            Your previous business KYC was rejected. {rejectionReason ? `Reason: ${rejectionReason}` : "Please update your details and resubmit."}
          </div>
        ) : null}
        <div className="mt-5 grid gap-3">
          {[
            ["Account", "Business role and dashboard access", Building2],
            ["Pickup", "Default warehouse or store location", Store],
            ["Dispatch", "Volume and support expectations", PackageCheck]
          ].map(([title, body, Icon]) => (
            <div key={String(title)} className="flex gap-3 rounded-fleet bg-fleet-paper p-3">
              <Icon className="mt-1 h-4 w-4 shrink-0 text-fleet-ember" />
              <span>
                <strong className="block text-sm font-black text-fleet-night">{String(title)}</strong>
                <span className="text-xs font-bold text-slate-500">{String(body)}</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Registration details</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Business information</h2>
          </div>
          <UsersRound className="h-5 w-5 text-fleet-ember" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={form.businessName} onChange={(value) => update("businessName", value)} placeholder="Adewale Stores" />
          <Field label="Contact person" value={form.contactName} onChange={(value) => update("contactName", value)} placeholder="Operations manager" />
          <Field label="Phone number" value={form.phone} onChange={(value) => update("phone", value)} placeholder="+234..." />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} placeholder="ops@business.com" />
          <label className="form-field">
            <span className="form-label">Industry</span>
            <select className="form-input" value={form.industry} onChange={(event) => update("industry", event.target.value)}>
              {["Retail and ecommerce", "Food and grocery", "Pharmacy", "Documents and services", "Wholesale", "Other"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Dispatch volume</span>
            <select className="form-input" value={form.dispatchVolume} onChange={(event) => update("dispatchVolume", event.target.value)}>
              {["1 - 10 weekly deliveries", "10 - 30 weekly deliveries", "30 - 100 weekly deliveries", "100+ weekly deliveries"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <Field label="Default pickup address" value={form.pickupAddress} onChange={(value) => update("pickupAddress", value)} placeholder="Shop, warehouse, or office address" wide />
        </div>
        {message ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}
        <div className="mt-6 grid gap-3 sm:grid-cols-[1fr_auto]">
          <Button type="button" onClick={submitBusiness} disabled={!complete || loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {registrationStatus === "rejected" ? "Resubmit KYC" : "Submit business KYC"}
          </Button>
          <LinkButton href="/business/dashboard" variant="secondary">
            Dashboard
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}
