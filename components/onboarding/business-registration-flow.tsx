"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { Building2, Camera, CheckCircle2, FileUp, Loader2, PackageCheck, Store, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadBusinessDocument } from "@/lib/storage";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

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
  { key: "director_government_id", label: "Director government ID", accept: "image/*,application/pdf" },
  { key: "address_proof", label: "Proof of business address", accept: "image/*,application/pdf" }
];

const businessTypeOptions = ["Restaurant", "Mall", "Grocery", "Pharmacy", "Fashion"] as const;
type BusinessType = (typeof businessTypeOptions)[number];

const commissionByBusinessType: Record<BusinessType, number> = {
  Restaurant: 12,
  Mall: 10,
  Grocery: 10,
  Pharmacy: 5,
  Fashion: 10
};

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
    commissionRate: commissionByBusinessType.Restaurant,
    industry: "Restaurant",
    dispatchVolume: "10 - 30 weekly deliveries",
    pickupAddress: "",
    cacNumber: ""
  });

  const complete = useMemo(
    () =>
      form.businessName.trim().length > 2 &&
      form.contactName.trim().length > 1 &&
      form.phone.trim().length >= 10 &&
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
            .select("business_name, contact_name, phone, email, industry, business_type, commission_rate, dispatch_volume, pickup_address, cac_number, registration_status, rejection_reason, business_documents(id, document_type, file_url, storage_path, status)")
            .eq("user_id", data.user.id)
            .maybeSingle<{
              business_name?: string | null;
              contact_name?: string | null;
              phone?: string | null;
              email?: string | null;
              industry?: string | null;
              business_type?: BusinessType | null;
              commission_rate?: number | null;
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
                businessType: business.business_type || current.businessType,
                commissionRate: Number(business.commission_rate ?? commissionByBusinessType[business.business_type || current.businessType]),
                industry: business.industry || business.business_type || current.industry,
                dispatchVolume: business.dispatch_volume || current.dispatchVolume,
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
      commissionRate: commissionByBusinessType[businessType]
    }));
  }

  function validateBusinessKyc() {
    const nextErrors: Record<string, string> = {
      businessName: form.businessName.trim().length > 2 ? "" : "Enter the registered business name.",
      contactName: form.contactName.trim().length > 1 ? "" : "Enter the contact person.",
      phone: form.phone.trim().length >= 10 ? "" : "Enter a valid phone number.",
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

      const profilePayload = {
        user_id: user.id,
        business_name: form.businessName,
        contact_name: form.contactName,
        phone: form.phone,
        email: form.email || user.email || null,
        industry: form.industry,
        business_type: form.businessType,
        commission_rate: form.commissionRate,
        dispatch_volume: form.dispatchVolume,
        pickup_address: form.pickupAddress,
        cac_number: form.cacNumber,
        registration_status: "submitted" as const,
        rejection_reason: null,
        updated_at: new Date().toISOString()
      };

      let profileResult = await supabase.from("business_profiles").upsert(profilePayload, { onConflict: "user_id" }).select("id").single<{ id: string }>();

      if (profileResult.error) {
        const { cac_number: _cacNumber, rejection_reason: _rejectionReason, business_type: _businessType, commission_rate: _commissionRate, ...fallbackPayload } = profilePayload;
        profileResult = await supabase.from("business_profiles").upsert(fallbackPayload, { onConflict: "user_id" }).select("id").single<{ id: string }>();
      }

      if (profileResult.error) throw profileResult.error;
      const businessProfileId = profileResult.data.id;
      const uploadedDocs = Object.values(docs).filter((doc): doc is UploadedBusinessDoc => Boolean(doc?.path || doc?.url));
      const { error: documentsError } = await supabase.from("business_documents").upsert(
        uploadedDocs.map((doc) => ({
          business_profile_id: businessProfileId,
          user_id: user.id,
          document_type: doc.key,
          file_url: doc.url || null,
          storage_path: doc.path || null,
          status: "submitted" as const,
          rejection_reason: null,
          updated_at: new Date().toISOString()
        })),
        { onConflict: "business_profile_id,document_type" }
      );
      if (documentsError) throw documentsError;

      await supabase.from("business_profiles").update({ registration_status: "submitted", rejection_reason: null, updated_at: new Date().toISOString() }).eq("id", businessProfileId);

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
      <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Business registration</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Register your business.</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            This creates a Fast Fleets 360 business account first, then opens the vendor setup for pickup points, bulk delivery tools, wallet records, and dispatch support.
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
            ? "Your business account has been approved by Fast Fleets 360 operations."
            : "Fast Fleets 360 admin will review your business profile. Your dashboard will show pending status until it is approved."}
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
          Add your company details so Fast Fleets 360 can tailor pickup, billing, support, and bulk dispatch workflows.
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
          <Field label="Business name" value={form.businessName} error={errors.businessName} onChange={(value) => update("businessName", value)} placeholder="Adewale Stores" />
          <Field label="Contact person" value={form.contactName} error={errors.contactName} onChange={(value) => update("contactName", value)} placeholder="Operations manager" />
          <Field label="Phone number" value={form.phone} error={errors.phone} onChange={(value) => update("phone", value)} placeholder="+234..." />
          <Field label="Email" value={form.email} onChange={(value) => update("email", value)} placeholder="ops@business.com" />
          <Field label="CAC registration number" value={form.cacNumber} error={errors.cacNumber} onChange={(value) => update("cacNumber", value)} placeholder="RC 1234567 / BN 1234567" />
          <label className="form-field">
            <span className="form-label">Select Business Type</span>
            <select className="form-input" value={form.businessType} onChange={(event) => updateBusinessType(event.target.value)}>
              {businessTypeOptions.map((item) => (
                <option key={item}>{item}</option>
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
      className="grid min-h-44 cursor-pointer place-items-center rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-4 text-center transition hover:border-fleet-gold hover:bg-white"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input className="sr-only" type="file" accept={accept} capture={camera ? "environment" : undefined} onChange={handleChange} />
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-fleet-ember shadow-lift">
        {camera ? <Camera className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
      </span>
      <span>
        <strong className="mt-3 block text-sm font-black text-fleet-night">{label}</strong>
        <span className="mt-1 block text-xs font-semibold text-slate-500">Drag, drop, browse, or use camera</span>
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
