"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { Banknote, Bike, Camera, CheckCircle2, FileText, FileUp, IdCard, Loader2, RefreshCcw, ShieldCheck, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadRiderDocument } from "@/lib/storage";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

const steps = ["Personal", "Vehicle", "Documents", "Payout", "Review"] as const;

const lgas = [
  "Agege, Lagos",
  "Ajeromi-Ifelodun, Lagos",
  "Alimosho, Lagos",
  "Amuwo-Odofin, Lagos",
  "Apapa, Lagos",
  "Badagry, Lagos",
  "Epe, Lagos",
  "Eti-Osa, Lagos",
  "Ibeju-Lekki, Lagos",
  "Ifako-Ijaiye, Lagos",
  "Ikeja, Lagos",
  "Ikorodu, Lagos",
  "Kosofe, Lagos",
  "Lagos Island, Lagos",
  "Lagos Mainland, Lagos",
  "Mushin, Lagos",
  "Ojo, Lagos",
  "Oshodi-Isolo, Lagos",
  "Shomolu, Lagos",
  "Surulere, Lagos",
  "Abeokuta North, Ogun",
  "Abeokuta South, Ogun",
  "Ado-Odo/Ota, Ogun",
  "Ewekoro, Ogun",
  "Ifo, Ogun",
  "Ijebu Ode, Ogun",
  "Obafemi Owode, Ogun",
  "Sagamu, Ogun",
  "Yewa North, Ogun",
  "Yewa South, Ogun"
];

const governmentIds = [
  ["nin_slip", "NIN slip"],
  ["voters_card", "Voter's Card"],
  ["drivers_licence", "Driver's Licence"],
  ["passport", "Passport"]
] as const;

const vehicleTypes = [
  ["motorcycle", "Motorcycle"],
  ["tricycle", "Tricycle"],
  ["car", "Car"],
  ["van", "Van"]
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;
type RiderVehicleType = (typeof vehicleTypes)[number][0];
type GovernmentIdType = (typeof governmentIds)[number][0];
type DocumentKey = "profile_photo" | "government_id" | "drivers_licence" | "vehicle_registration" | "insurance_certificate" | "guarantor_letter";

type UploadedDoc = {
  key: DocumentKey;
  label: string;
  name: string;
  progress: number;
  url?: string;
  path?: string;
  contentType?: string;
};

type Bank = {
  name: string;
  code: string;
};

type RiderForm = {
  fullName: string;
  phone: string;
  email: string;
  lga: string;
  vehicleType: RiderVehicleType;
  make: string;
  model: string;
  year: string;
  plateNumber: string;
  color: string;
  governmentIdType: GovernmentIdType;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  bvn: string;
  agreement: boolean;
};

type SubmitPayload = {
  form: RiderForm;
  documents: UploadedDoc[];
};

function normalizeNigerianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "+234";
  if (digits.startsWith("234")) return `+${digits.slice(0, 13)}`;
  if (digits.startsWith("0")) return `+234${digits.slice(1, 11)}`;
  return `+234${digits.slice(0, 10)}`;
}

function validateEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function validatePhone(value: string) {
  return /^\+234[789][01]\d{8}$/.test(value.trim());
}

export function RiderOnboardingFlow() {
  const [current, setCurrent] = useState<StepIndex>(0);
  const [loadingUser, setLoadingUser] = useState(true);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [banksLoading, setBanksLoading] = useState(true);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [docs, setDocs] = useState<Partial<Record<DocumentKey, UploadedDoc>>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState<RiderForm>({
    fullName: "",
    phone: "+234",
    email: "",
    lga: lgas[0],
    vehicleType: "motorcycle",
    make: "",
    model: "",
    year: "",
    plateNumber: "",
    color: "",
    governmentIdType: "nin_slip",
    bankName: "",
    bankCode: "",
    accountNumber: "",
    accountName: "",
    bvn: "",
    agreement: false
  });

  const documentRequirements = useMemo(() => {
    const requirements: Array<{ key: DocumentKey; label: string; accept: string; camera?: boolean }> = [
      { key: "profile_photo", label: "Profile photo", accept: "image/*", camera: true },
      { key: "government_id", label: `Government ID: ${governmentIds.find(([value]) => value === form.governmentIdType)?.[1] || "Selected ID"}`, accept: "image/*" },
      { key: "vehicle_registration", label: "Vehicle registration document", accept: "image/*,application/pdf" },
      { key: "insurance_certificate", label: "Third-party insurance certificate", accept: "image/*,application/pdf" },
      { key: "guarantor_letter", label: "Guarantor letter", accept: "image/*,application/pdf" }
    ];
    if (form.governmentIdType !== "drivers_licence") {
      requirements.splice(2, 0, { key: "drivers_licence", label: "Driver's Licence", accept: "image/*" });
    }
    return requirements;
  }, [form.governmentIdType]);

  const validators = useMemo(
    () => [
      () => ({
        fullName: form.fullName.trim().length >= 2 ? "" : "Enter your legal full name.",
        phone: validatePhone(form.phone) ? "" : "Use a Nigerian number like +2348012345678.",
        email: validateEmail(form.email) ? "" : "Enter a valid email address.",
        lga: form.lga ? "" : "Select your LGA of operation.",
        profilePhoto: docs.profile_photo?.url || docs.profile_photo?.path ? "" : "Upload a profile photo."
      }),
      () => ({
        make: form.make.trim() ? "" : "Enter the vehicle make.",
        model: form.model.trim() ? "" : "Enter the vehicle model.",
        year: /^(19|20)\d{2}$/.test(form.year) ? "" : "Enter a valid year.",
        plateNumber: form.plateNumber.trim() ? "" : "Enter the plate number.",
        color: form.color.trim() ? "" : "Enter the vehicle colour."
      }),
      () =>
        Object.fromEntries(
          documentRequirements
            .filter((requirement) => requirement.key !== "profile_photo")
            .map((requirement) => [requirement.key, docs[requirement.key]?.url || docs[requirement.key]?.path ? "" : `Upload ${requirement.label.toLowerCase()}.`])
        ),
      () => ({
        bankCode: form.bankCode ? "" : "Select a bank.",
        accountNumber: /^\d{10}$/.test(form.accountNumber) ? "" : "Enter a 10-digit account number.",
        accountName: form.accountName.trim() ? "" : "Verify the account name before continuing.",
        bvn: /^\d{11}$/.test(form.bvn) ? "" : "Enter your 11-digit BVN."
      }),
      () => ({
        agreement: form.agreement ? "" : "Accept the rider agreement before submitting."
      })
    ],
    [docs, documentRequirements, form]
  );

  const stepComplete = validators.map((validator) => Object.values(validator()).every((value) => !value));
  const completion = Math.round(((current + 1) / steps.length) * 100);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;
      setForm((previous) => ({
        ...previous,
        email: data.user?.email || previous.email,
        phone: data.user?.phone ? normalizeNigerianPhone(data.user.phone) : previous.phone,
        fullName: data.user?.user_metadata?.full_name || data.user?.user_metadata?.name || previous.fullName
      }));
      setLoadingUser(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    loadBanks();
  }, []);

  useEffect(() => {
    const accountNumber = form.accountNumber.replace(/\D/g, "");
    if (!form.bankCode || accountNumber.length !== 10) {
      setBankMessage(null);
      setBankLoading(false);
      return;
    }

    let cancelled = false;
    setBankLoading(true);
    setBankMessage("Checking account name...");
    const timer = window.setTimeout(() => {
      fetch(`/api/paystack/resolve-account?bankCode=${encodeURIComponent(form.bankCode)}&accountNumber=${encodeURIComponent(accountNumber)}`)
        .then((response) => response.json())
        .then((payload: { accountName?: string; error?: string }) => {
          if (cancelled) return;
          if (payload.accountName) {
            update("accountName", payload.accountName);
            setBankMessage("Account name verified.");
            clearError("accountName");
          } else {
            update("accountName", "");
            setBankMessage(payload.error || "Could not verify this account number.");
          }
        })
        .catch(() => {
          if (!cancelled) setBankMessage("Could not verify account name right now.");
        })
        .finally(() => {
          if (!cancelled) setBankLoading(false);
        });
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.accountNumber, form.bankCode]);

  function update<K extends keyof RiderForm>(key: K, value: RiderForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function clearError(key: string) {
    setErrors((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  async function loadBanks() {
    setBanksLoading(true);
    try {
      const response = await fetch("/api/paystack/banks");
      const payload: { banks?: Bank[] } = await response.json();
      setBanks(Array.isArray(payload.banks) ? payload.banks : []);
    } catch {
      setBanks([]);
    } finally {
      setBanksLoading(false);
    }
  }

  function validateStep(index: StepIndex) {
    const result = validators[index]();
    const nextErrors = Object.fromEntries(Object.entries(result).filter(([, value]) => value));
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function goNext() {
    if (!validateStep(current)) return;
    setMessage(null);
    setCurrent((value) => Math.min(4, value + 1) as StepIndex);
  }

  function openStep(index: StepIndex) {
    const earlierIncomplete = stepComplete.findIndex((complete, stepIndex) => stepIndex < index && !complete);
    if (earlierIncomplete !== -1) {
      setCurrent(earlierIncomplete as StepIndex);
      validateStep(earlierIncomplete as StepIndex);
      return;
    }
    setErrors({});
    setCurrent(index);
  }

  async function handleFile(key: DocumentKey, label: string, file: File) {
    setDocs((previous) => ({
      ...previous,
      [key]: { key, label, name: file.name, progress: 10, contentType: file.type }
    }));

    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload documents.");
      const upload = await uploadRiderDocument(user.id, key, file, (progress) => {
        setDocs((previous) => ({
          ...previous,
          [key]: { ...(previous[key] || { key, label, name: file.name }), progress }
        }));
      });
      setDocs((previous) => ({
        ...previous,
        [key]: { key, label, name: file.name, progress: 100, url: upload.publicUrl, path: upload.path, contentType: upload.type }
      }));
      clearError(key);
      if (key === "profile_photo") clearError("profilePhoto");
    } catch (error) {
      setDocs((previous) => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setMessage(error instanceof Error ? error.message : "Upload failed. Try again.");
    }
  }

  async function submitApplication() {
    if (!validateStep(4) || !stepComplete.slice(0, 4).every(Boolean)) {
      setMessage("Review each step and complete the missing details before submitting.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const payload: SubmitPayload = {
        form,
        documents: Object.values(docs).filter((doc): doc is UploadedDoc => Boolean(doc?.path || doc?.url))
      };
      const response = await fetch("/api/rider/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not submit your application.");
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not submit your application.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingUser) return <OnboardingSkeleton />;

  if (submitted) {
    return (
      <Card className="mx-auto max-w-3xl p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <StatusBadge tone="amber" className="mt-5">Pending review</StatusBadge>
        <h1 className="mt-3 text-3xl font-black text-fleet-night sm:text-4xl">Application submitted.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          We review within 48 hours. You&apos;ll receive an SMS and email.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/rider/dashboard" variant="secondary">Open rider dashboard</LinkButton>
          <LinkButton href="/support">Contact support</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
      <Card className="p-5">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Rider onboarding</span>
        <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Complete your rider application.</h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Submit your identity, vehicle, documents, and payout details for manual operations review.
        </p>
        <div className="mt-6 rounded-fleet bg-fleet-paper p-3">
          <div className="flex justify-between text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <span>{steps[current]}</span>
            <span>{completion}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-fleet-navy transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => openStep(index as StepIndex)}
              className={`flex items-center justify-between rounded-fleet px-3 py-3 text-left text-sm font-black transition ${
                current === index ? "bg-fleet-navy text-white" : "bg-white text-slate-600 hover:bg-fleet-paper"
              }`}
            >
              {step}
              <span>{stepComplete[index] ? "Done" : index + 1}</span>
            </button>
          ))}
        </div>
        {message ? <div className="mt-4 rounded-fleet bg-amber-50 p-3 text-sm font-bold leading-6 text-amber-800">{message}</div> : null}
      </Card>

      <Card className="p-4 sm:p-6">
        {current === 0 ? (
          <StepShell icon={UserRound} title="Personal details">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={form.fullName} error={errors.fullName} onChange={(value) => update("fullName", value)} placeholder="Your legal name" />
              <Field label="Phone number" value={form.phone} error={errors.phone} onChange={(value) => update("phone", normalizeNigerianPhone(value))} placeholder="+2348012345678" inputMode="tel" />
              <Field label="Email" value={form.email} error={errors.email} onChange={(value) => update("email", value)} placeholder="you@example.com" inputMode="email" />
              <label className="form-field">
                <span className="form-label">LGA of operation</span>
                <select className="form-input" value={form.lga} onChange={(event) => update("lga", event.target.value)}>
                  {lgas.map((lga) => <option key={lga}>{lga}</option>)}
                </select>
                {errors.lga ? <span className="text-xs font-bold text-red-600">{errors.lga}</span> : null}
              </label>
              <div className="sm:col-span-2">
                <DocumentDropzone
                  type="profile_photo"
                  label="Profile photo"
                  accept="image/*"
                  camera
                  doc={docs.profile_photo}
                  error={errors.profilePhoto}
                  onFile={handleFile}
                />
              </div>
            </div>
          </StepShell>
        ) : null}

        {current === 1 ? (
          <StepShell icon={Bike} title="Vehicle details">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Vehicle type</span>
                <select className="form-input" value={form.vehicleType} onChange={(event) => update("vehicleType", event.target.value as RiderVehicleType)}>
                  {vehicleTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <Field label="Make" value={form.make} error={errors.make} onChange={(value) => update("make", value)} placeholder="Honda" />
              <Field label="Model" value={form.model} error={errors.model} onChange={(value) => update("model", value)} placeholder="CB125F" />
              <Field label="Year" value={form.year} error={errors.year} onChange={(value) => update("year", value.replace(/\D/g, "").slice(0, 4))} placeholder="2022" inputMode="numeric" />
              <Field label="Plate number" value={form.plateNumber} error={errors.plateNumber} onChange={(value) => update("plateNumber", value.toUpperCase())} placeholder="ABC-123XY" />
              <Field label="Colour" value={form.color} error={errors.color} onChange={(value) => update("color", value)} placeholder="Black" />
            </div>
          </StepShell>
        ) : null}

        {current === 2 ? (
          <StepShell icon={IdCard} title="Documents">
            <div className="grid gap-4">
              <label className="form-field">
                <span className="form-label">Government ID type</span>
                <select className="form-input" value={form.governmentIdType} onChange={(event) => update("governmentIdType", event.target.value as GovernmentIdType)}>
                  {governmentIds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                {documentRequirements.filter((requirement) => requirement.key !== "profile_photo").map((requirement) => (
                  <DocumentDropzone
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
          </StepShell>
        ) : null}

        {current === 3 ? (
          <StepShell icon={Banknote} title="Bank / payout details">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Bank name</span>
                {banksLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : banks.length ? (
                  <select
                    className="form-input"
                    value={form.bankCode}
                    onChange={(event) => {
                      const selected = banks.find((bank) => bank.code === event.target.value);
                      update("bankCode", selected?.code || "");
                      update("bankName", selected?.name || "");
                      update("accountName", "");
                    }}
                  >
                    <option value="">Select bank</option>
                    {banks.map((bank) => <option key={bank.code} value={bank.code}>{bank.name}</option>)}
                  </select>
                ) : (
                  <EmptyBanks onRetry={loadBanks} />
                )}
                {errors.bankCode ? <span className="text-xs font-bold text-red-600">{errors.bankCode}</span> : null}
              </label>
              <Field
                label="Account number"
                value={form.accountNumber}
                error={errors.accountNumber}
                onChange={(value) => {
                  update("accountNumber", value.replace(/\D/g, "").slice(0, 10));
                  update("accountName", "");
                }}
                placeholder="0123456789"
                inputMode="numeric"
              />
              <Field label="Verified account name" value={form.accountName} error={errors.accountName} onChange={(value) => update("accountName", value)} placeholder="Auto-filled by Paystack" wide readOnly />
              <Field label="BVN" value={form.bvn} error={errors.bvn} onChange={(value) => update("bvn", value.replace(/\D/g, "").slice(0, 11))} placeholder="11 digits" inputMode="numeric" />
            </div>
            <div className="mt-5 rounded-fleet border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {bankLoading ? "Checking Paystack for the account name..." : bankMessage || "Select a bank and enter a 10-digit account number to verify the account name automatically."}
            </div>
          </StepShell>
        ) : null}

        {current === 4 ? (
          <StepShell icon={CheckCircle2} title="Review & submit">
            <div className="grid gap-3">
              <ReviewRow label="Name" value={form.fullName || "Not provided"} />
              <ReviewRow label="Contact" value={`${form.phone} / ${form.email}`} />
              <ReviewRow label="LGA" value={form.lga} />
              <ReviewRow label="Vehicle" value={`${form.vehicleType}, ${form.make} ${form.model} (${form.year})`} />
              <ReviewRow label="Plate" value={`${form.plateNumber || "No plate"} / ${form.color || "No colour"}`} />
              <ReviewRow label="Bank" value={`${form.bankName || "Bank"} / ${form.accountName || "Unverified"}`} />
              <ReviewRow label="Documents" value={`${Object.values(docs).filter(Boolean).length} uploaded`} />
              <label className="mt-3 flex items-start gap-3 rounded-fleet border border-fleet-line bg-fleet-paper p-4 text-sm font-bold text-slate-700">
                <input
                  className="mt-1 h-4 w-4 accent-fleet-navy"
                  type="checkbox"
                  checked={form.agreement}
                  onChange={(event) => update("agreement", event.target.checked)}
                />
                <span>I agree to the FastFleet Rider Agreement and Code of Conduct</span>
              </label>
              {errors.agreement ? <span className="text-xs font-bold text-red-600">{errors.agreement}</span> : null}
            </div>
          </StepShell>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" disabled={current === 0 || loading} onClick={() => setCurrent((value) => Math.max(0, value - 1) as StepIndex)}>
            Back
          </Button>
          {current < 4 ? (
            <Button type="button" onClick={goNext} className="bg-fleet-navy hover:bg-fleet-night">
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={loading} onClick={submitApplication} className="bg-fleet-navy hover:bg-fleet-night">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Submit for review
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="grid gap-6 lg:grid-cols-[0.78fr_1.22fr]">
      <Card className="p-5">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="mt-4 h-12 w-4/5" />
        <Skeleton className="mt-4 h-24 w-full" />
        <Skeleton className="mt-6 h-40 w-full" />
      </Card>
      <Card className="p-5">
        <Skeleton className="h-12 w-12" />
        <Skeleton className="mt-4 h-8 w-52" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    </div>
  );
}

function StepShell({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div>
      <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-navy text-white">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-2xl font-black text-fleet-night">{title}</h2>
      <div className="mt-5">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  error,
  wide,
  readOnly,
  inputMode
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  error?: string;
  wide?: boolean;
  readOnly?: boolean;
  inputMode?: "email" | "numeric" | "tel";
}) {
  return (
    <label className={`form-field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} readOnly={readOnly} inputMode={inputMode} />
      {error ? <span className="text-xs font-bold text-red-600">{error}</span> : null}
    </label>
  );
}

function DocumentDropzone({
  type,
  label,
  accept,
  camera,
  doc,
  error,
  onFile
}: {
  type: DocumentKey;
  label: string;
  accept: string;
  camera?: boolean;
  doc?: UploadedDoc;
  error?: string;
  onFile: (type: DocumentKey, label: string, file: File) => void;
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
      <input className="sr-only" type="file" accept={accept} capture={camera ? "user" : undefined} onChange={handleChange} />
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

function EmptyBanks({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="rounded-fleet border border-dashed border-fleet-line bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-fleet-paper text-fleet-navy">
          <FileText className="h-5 w-5" />
        </span>
        <div>
          <strong className="block text-sm font-black text-fleet-night">Bank network sync pending</strong>
          <span className="text-xs font-semibold text-slate-500">Try again while we reconnect to the payment network.</span>
        </div>
      </div>
      <Button type="button" variant="secondary" size="sm" className="mt-3 w-full" onClick={onRetry}>
        <RefreshCcw className="h-4 w-4" />
        Retry
      </Button>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-fleet bg-fleet-paper px-4 py-3">
      <span className="text-sm font-bold text-slate-500">{label}</span>
      <strong className="text-right text-sm font-black text-fleet-night">{value}</strong>
    </div>
  );
}
