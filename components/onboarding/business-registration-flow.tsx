"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Building2, Camera, CheckCircle2, FileUp, Loader2, PackageCheck, Store, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadBusinessDocument } from "@/lib/storage";
import { NIGERIAN_STATES, normalizeState } from "@/lib/launch-states";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";
import { businessCommissionRate } from "@/lib/business-commission";

type BusinessRegistrationStatus = "submitted" | "active" | "paused" | "rejected";
type BusinessDocumentKey = "storefront_photo" | "cac_certificate" | "director_government_id" | "address_proof";

type UploadedBusinessDoc = {
  key: BusinessDocumentKey;
  label: string;
  name: string;
  progress: number;
  url?: string;
  path?: string;
  contentType?: string;
};

const businessDocumentRequirements: Array<{ key: BusinessDocumentKey; label: string; accept: string; camera?: boolean }> = [
  { key: "storefront_photo", label: "Shop front / office photo", accept: "image/*", camera: true },
  { key: "cac_certificate", label: "CAC certificate", accept: "image/*,application/pdf" },
  { key: "address_proof", label: "Proof of business address", accept: "image/*,application/pdf" }
];

const businessTypeOptions = ["Restaurant", "Grocery", "Pharmacy", "Fashion", "Electronics", "Gadgets"] as const;
type BusinessType = (typeof businessTypeOptions)[number];
type StoredBusinessType = BusinessType | "Mall";

export function BusinessRegistrationFlow() {
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<BusinessRegistrationStatus | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [docs, setDocs] = useState<Partial<Record<BusinessDocumentKey, UploadedBusinessDoc>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    phone: "",
    email: "",
    businessType: "Restaurant" as BusinessType,
    commissionRate: businessCommissionRate("Restaurant"),
    industry: "Restaurant",
    dispatchVolume: "10 - 30 weekly deliveries",
    state: "",
    pickupAddress: "",
    cacNumber: ""
  });

  const complete = useMemo(
    () =>
      form.businessName.trim().length > 2 &&
      form.contactName.trim().length > 1 &&
      form.phone.trim().length >= 10 &&
      Boolean(normalizeState(form.state)) &&
      form.pickupAddress.trim().length > 4 &&
      form.cacNumber.trim().length > 3 &&
      businessDocumentRequirements.every((requirement) => Boolean(docs[requirement.key]?.path || docs[requirement.key]?.url)),
    [docs, form]
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
            .select("business_name, contact_name, phone, email, industry, business_type, commission_rate, operating_state, dispatch_volume, pickup_address, cac_number, registration_status, rejection_reason, business_documents(id, document_type, file_url, storage_path, status)")
            .eq("user_id", data.user.id)
            .maybeSingle<{
              business_name?: string | null;
              contact_name?: string | null;
              phone?: string | null;
              email?: string | null;
              industry?: string | null;
              business_type?: StoredBusinessType | null;
              commission_rate?: number | null;
              operating_state?: string | null;
              dispatch_volume?: string | null;
              pickup_address?: string | null;
              cac_number?: string | null;
              registration_status?: BusinessRegistrationStatus | null;
              rejection_reason?: string | null;
              business_documents?: Array<{
                id: string;
                document_type: BusinessDocumentKey;
                file_url?: string | null;
                storage_path?: string | null;
                status?: string | null;
              }> | null;
            }>()
            .then(async ({ data: business, error }) => {
              const appUserResult = await supabase.from("users").select("default_zone").eq("id", data.user.id).maybeSingle<{ default_zone?: string | null }>();
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
              const storedBusinessType = normalizeSelectableBusinessType(business.business_type);
              setForm((current) => ({
                ...current,
                businessName: business.business_name || current.businessName,
                contactName: business.contact_name || current.contactName,
                phone: business.phone || current.phone,
                email: business.email || data.user.email || current.email,
                businessType: storedBusinessType || current.businessType,
                commissionRate: Number(business.commission_rate ?? businessCommissionRate(storedBusinessType || current.businessType)),
                industry: business.industry && business.industry !== "Mall" && business.industry !== "Shopping" ? business.industry : storedBusinessType || current.industry,
                dispatchVolume: business.dispatch_volume || current.dispatchVolume,
                state: normalizeState(business.operating_state || appUserResult.data?.default_zone) || current.state,
                pickupAddress: business.pickup_address || current.pickupAddress,
                cacNumber: business.cac_number || current.cacNumber
              }));
              if (business.business_documents?.length) {
                const nextDocs = Object.fromEntries(
                  business.business_documents.map((document) => {
                    const requirement = businessDocumentRequirements.find((item) => item.key === document.document_type);
                    return [
                      document.document_type,
                      {
                        key: document.document_type,
                        label: requirement?.label || document.document_type.replaceAll("_", " "),
                        name: document.storage_path?.split("/").pop() || document.document_type,
                        progress: 100,
                        url: document.file_url || undefined,
                        path: document.storage_path || undefined
                      }
                    ];
                  })
                ) as Partial<Record<BusinessDocumentKey, UploadedBusinessDoc>>;
                setDocs(nextDocs);
              }
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
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function updateBusinessType(value: string) {
    const businessType = (businessTypeOptions.includes(value as BusinessType) ? value : "Restaurant") as BusinessType;
    setForm((current) => ({
      ...current,
      businessType,
      industry: businessType,
      commissionRate: businessCommissionRate(businessType)
    }));
  }

  function validateBusinessKyc() {
    const nextErrors: Record<string, string> = {
      businessName: form.businessName.trim().length > 2 ? "" : "Enter the registered business name.",
      contactName: form.contactName.trim().length > 1 ? "" : "Enter the contact person.",
      phone: form.phone.trim().length >= 10 ? "" : "Enter a valid phone number.",
      state: normalizeState(form.state) ? "" : "Select the state where this business operates.",
      pickupAddress: form.pickupAddress.trim().length > 4 ? "" : "Enter the default pickup address.",
      businessType: form.businessType ? "" : "Select the business type.",
      cacNumber: form.cacNumber.trim().length > 3 ? "" : "Enter the CAC registration number."
    };
    for (const requirement of businessDocumentRequirements) {
      nextErrors[requirement.key] = docs[requirement.key]?.path || docs[requirement.key]?.url ? "" : `Upload ${requirement.label.toLowerCase()}.`;
    }
    const filtered = Object.fromEntries(Object.entries(nextErrors).filter(([, value]) => value));
    setErrors(filtered);
    return Object.keys(filtered).length === 0;
  }

  async function handleFile(key: BusinessDocumentKey, label: string, file: File) {
    setDocs((previous) => ({
      ...previous,
      [key]: { key, label, name: file.name, progress: 10, contentType: file.type }
    }));

    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload business documents.");
      const upload = await uploadBusinessDocument(user.id, key, file, (progress) => {
        setDocs((previous) => ({
          ...previous,
          [key]: { ...(previous[key] || { key, label, name: file.name }), progress }
        }));
      });
      setDocs((previous) => ({
        ...previous,
        [key]: { key, label, name: file.name, progress: 100, url: upload.publicUrl, path: upload.path, contentType: upload.type }
      }));
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (error) {
      setDocs((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setMessage(error instanceof Error ? error.message : "Business document upload failed. Try again.");
    }
  }

  async function submitBusiness() {
    if (!validateBusinessKyc()) {
      setMessage("Complete the business details and upload every required KYC document before submitting.");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const uploadedDocs = Object.values(docs).filter((doc): doc is UploadedBusinessDoc => Boolean(doc?.path || doc?.url));
      const response = await fetch("/api/business/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form, documents: uploadedDocs })
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string; registration_status?: BusinessRegistrationStatus };
      if (!response.ok) throw new Error(result.error || "Business KYC submission failed. Try again.");
      setRegistrationStatus("submitted");
      setRejectionReason(null);
      setSubmitted(true);
    } catch {
      window.localStorage.setItem(
        "fastfleet.next.business_registration",
        JSON.stringify({
          form,
          documents: Object.values(docs).filter(Boolean),
          registration_status: "submitted",
          created_at: new Date().toISOString()
        })
      );
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (!authReady) return <Card className="mx-auto h-96 max-w-3xl animate-pulse bg-white" />;

  if (!signedIn) {
    return (
      <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
        <Card className="self-start p-4 sm:p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Business registration</span>
          <h1 className="mt-2 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Register business.</h1>
          <div className="mt-5 grid gap-2 rounded-[16px] bg-fleet-paper p-3 text-sm font-black text-fleet-night">
            <span>Dashboard access</span>
            <span>Pickup settings</span>
            <span>Dispatch tools</span>
          </div>
        </Card>
        <PhoneAuthForm
          title="Create business account"
          description=""
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
    <div className="grid gap-4 lg:grid-cols-[0.64fr_1.36fr]">
      <Card className="self-start p-4 sm:p-5">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Vendor setup</span>
        <h1 className="mt-2 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Business KYC.</h1>
        {registrationStatus === "rejected" ? (
          <div className="mt-5 rounded-fleet border border-red-200 bg-red-50 p-4 text-sm font-bold leading-6 text-red-700">
            Your previous business KYC was rejected. {rejectionReason ? `Reason: ${rejectionReason}` : "Please update your details and resubmit."}
          </div>
        ) : null}
        <div className="mt-5 grid gap-2">
          {[
            ["Account", Building2],
            ["Pickup", Store],
            ["Dispatch", PackageCheck]
          ].map(([title, Icon]) => (
            <div key={String(title)} className="flex items-center gap-3 rounded-[14px] bg-fleet-paper px-3 py-2">
              <Icon className="h-4 w-4 shrink-0 text-fleet-ember" />
              <strong className="block text-sm font-black text-fleet-night">{String(title)}</strong>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4 border-b border-fleet-line pb-4">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Registration details</span>
            <h2 className="mt-1 text-2xl font-black text-fleet-night">Business information</h2>
          </div>
          <UsersRound className="h-5 w-5 text-fleet-ember" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Business name" value={form.businessName} error={errors.businessName} onChange={(value) => update("businessName", value)} placeholder="Adewale Stores" />
          <Field label="Contact person" value={form.contactName} error={errors.contactName} onChange={(value) => update("contactName", value)} placeholder="Operations manager" />
          <Field label="Phone number" value={form.phone} error={errors.phone} onChange={(value) => update("phone", value)} placeholder="+234..." />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} placeholder="ops@business.com" />
          <Field label="CAC registration number" value={form.cacNumber} error={errors.cacNumber} onChange={(value) => update("cacNumber", value)} placeholder="RC 1234567 / BN 1234567" />
          <label className="form-field">
            <span className="form-label">Business operating state</span>
            <select className="form-input" value={form.state} onChange={(event) => update("state", event.target.value)}>
              <option value="">Select state</option>
              {NIGERIAN_STATES.map((state) => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
            {errors.state ? <span className="text-xs font-bold text-red-600">{errors.state}</span> : null}
          </label>
          <label className="form-field">
            <span className="form-label">Select Business Type</span>
              <select className="form-input" value={form.businessType} onChange={(event) => updateBusinessType(event.target.value)}>
                {businessTypeOptions.map((item) => (
                <option key={item} value={item}>{item === "Pharmacy" ? "Med / Pharmacy" : item}</option>
                ))}
              </select>
            {errors.businessType ? <span className="text-xs font-bold text-red-600">{errors.businessType}</span> : null}
          </label>
          <Field label="Commission rate" value={`${form.commissionRate}%`} onChange={() => undefined} placeholder="Auto-filled" readOnly />
          <label className="form-field">
            <span className="form-label">Dispatch volume</span>
            <select className="form-input" value={form.dispatchVolume} onChange={(event) => update("dispatchVolume", event.target.value)}>
              {["1 - 10 weekly deliveries", "10 - 30 weekly deliveries", "30 - 100 weekly deliveries", "100+ weekly deliveries"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <Field label="Default pickup address" value={form.pickupAddress} error={errors.pickupAddress} onChange={(value) => update("pickupAddress", value)} placeholder="Shop, warehouse, or office address" wide />
        </div>
        <div className="mt-6">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">KYC documents</span>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {businessDocumentRequirements.map((requirement) => (
              <BusinessDocumentDropzone
                key={requirement.key}
                type={requirement.key}
                label={requirement.label}
                accept={requirement.accept}
                camera={requirement.camera}
                doc={docs[requirement.key]}
                error={errors[requirement.key]}
                onFile={handleFile}
              />
            ))}
          </div>
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

function normalizeSelectableBusinessType(value: StoredBusinessType | string | null | undefined): BusinessType | null {
  return businessTypeOptions.includes(value as BusinessType) ? (value as BusinessType) : null;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  readOnly = false,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  readOnly?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} readOnly={readOnly} />
      {error ? <span className="text-xs font-bold text-red-600">{error}</span> : null}
    </label>
  );
}

function BusinessDocumentDropzone({
  type,
  label,
  accept,
  camera,
  doc,
  error,
  onFile
}: {
  type: BusinessDocumentKey;
  label: string;
  accept: string;
  camera?: boolean;
  doc?: UploadedBusinessDoc;
  error?: string;
  onFile: (type: BusinessDocumentKey, label: string, file: File) => void;
}) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(type, label, file);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    handleFiles(event.dataTransfer.files);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    handleFiles(event.target.files);
  }

  return (
    <label
      className="grid min-h-36 cursor-pointer place-items-center rounded-[16px] border border-dashed border-fleet-line bg-fleet-paper p-3 text-center transition hover:border-fleet-gold hover:bg-white"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input className="sr-only" type="file" accept={accept} capture={camera ? "environment" : undefined} onChange={handleChange} />
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-fleet-ember shadow-lift">
        {camera ? <Camera className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
      </span>
      <span>
        <strong className="mt-3 block text-sm font-black text-fleet-night">{label}</strong>
        <span className="mt-1 block text-xs font-semibold text-slate-500">Browse or use camera</span>
      </span>
      {doc ? (
        <span className="mt-3 block w-full">
          <span className="block truncate text-xs font-bold text-slate-600">{doc.name}</span>
          <span className="mt-2 block h-2 rounded-full bg-white">
            <span className="block h-2 rounded-full bg-fleet-navy" style={{ width: `${doc.progress}%` }} />
          </span>
        </span>
      ) : null}
      {error ? <span className="mt-3 text-xs font-bold text-red-600">{error}</span> : null}
    </label>
  );
}
