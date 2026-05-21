"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
import { Banknote, Bike, Camera, CheckCircle2, FileUp, IdCard, Loader2, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { uploadRiderDocument } from "@/lib/storage";
import type { VehicleType } from "@/types/domain";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { PhoneAuthForm } from "@/components/auth/phone-auth-form";

const steps = ["Personal", "Vehicle", "Documents", "Banking", "Review"];
const zones = ["Lekki / VI", "Ikeja / Ogba", "Surulere / Yaba", "Ajah / Sangotedo", "Ota / Ogun", "Abeokuta / Ogun"];
const documentTypes = [
  ["nin", "NIN / National ID"],
  ["license", "Driver's license"],
  ["vehicle_papers", "Bike or vehicle papers"],
  ["selfie", "Profile photo / selfie"]
];

type UploadedDoc = {
  type: string;
  name: string;
  progress: number;
  url?: string;
};

type Bank = {
  name: string;
  code: string;
};

export function RiderOnboardingFlow() {
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [docs, setDocs] = useState<Record<string, UploadedDoc>>({});
  const [form, setForm] = useState({
    fullName: "",
    phone: "",
    address: "",
    zone: "Lekki / VI",
    vehicleType: "bike" as VehicleType,
    plateNumber: "",
    vehicleColor: "",
    bankName: "",
    bankCode: "",
    accountNumber: "",
    accountName: ""
  });

  const completion = useMemo(() => Math.round(((current + 1) / steps.length) * 100), [current]);
  const stepComplete = useMemo(
    () => [
      Boolean(form.fullName.trim() && form.phone.trim() && form.address.trim() && form.zone.trim()),
      Boolean(form.vehicleType && form.plateNumber.trim() && form.vehicleColor.trim()),
      documentTypes.every(([type]) => Boolean(docs[type]?.url || docs[type]?.progress === 100)),
      Boolean(form.bankName.trim() && form.bankCode.trim() && form.accountNumber.trim().length === 10 && form.accountName.trim()),
      true
    ],
    [docs, form]
  );
  const firstIncompleteStep = stepComplete.findIndex((complete) => !complete);
  const furthestAllowedStep = firstIncompleteStep === -1 ? steps.length - 1 : firstIncompleteStep;

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        setSignedIn(Boolean(data.user));
        setAuthReady(true);
      });
    } catch {
      setAuthReady(true);
    }
  }, []);

  useEffect(() => {
    fetch("/api/paystack/banks")
      .then((response) => response.json())
      .then((payload) => {
        if (Array.isArray(payload.banks)) setBanks(payload.banks);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const accountNumber = form.accountNumber.replace(/\D/g, "");
    if (!form.bankCode || accountNumber.length !== 10) {
      setBankMessage(null);
      return;
    }

    let cancelled = false;
    setBankLoading(true);
    setBankMessage("Checking account name...");
    const timer = window.setTimeout(() => {
      fetch(`/api/paystack/resolve-account?bankCode=${encodeURIComponent(form.bankCode)}&accountNumber=${encodeURIComponent(accountNumber)}`)
        .then((response) => response.json())
        .then((payload) => {
          if (cancelled) return;
          if (payload.accountName) {
            update("accountName", payload.accountName);
            setBankMessage("Account name verified.");
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

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function openStep(index: number) {
    if (index <= furthestAllowedStep) {
      setCurrent(index);
      setMessage(null);
      return;
    }
    setMessage(`Complete ${steps[furthestAllowedStep]} before moving to ${steps[index]}.`);
  }

  function nextStep() {
    if (!stepComplete[current]) {
      setMessage(`Complete ${steps[current]} before continuing.`);
      return;
    }
    setMessage(null);
    setCurrent((value) => Math.min(steps.length - 1, value + 1));
  }

  async function handleFile(type: string, file: File) {
    setDocs((previous) => ({
      ...previous,
      [type]: { type, name: file.name, progress: 8 }
    }));

    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      const userId = user?.id || `demo-${Date.now()}`;
      const upload = await uploadRiderDocument(userId, type, file, (progress) => {
        setDocs((previous) => ({
          ...previous,
          [type]: { ...(previous[type] || { type, name: file.name }), progress }
        }));
      });

      setDocs((previous) => ({
        ...previous,
        [type]: { type, name: file.name, progress: 100, url: upload.publicUrl }
      }));
    } catch {
      setDocs((previous) => ({
        ...previous,
        [type]: { type, name: file.name, progress: 100, url: URL.createObjectURL(file) }
      }));
    }
  }

  async function submitApplication() {
    setLoading(true);
    setMessage(null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        setMessage("Sign in with phone OTP first so your application can be tied to a secure account.");
        setLoading(false);
        return;
      }

      await supabase.from("users").upsert({
        id: user.id,
        full_name: form.fullName,
        phone: form.phone,
        role: "rider",
        default_zone: form.zone,
        updated_at: new Date().toISOString()
      });

      const profile = await supabase
        .from("rider_profiles")
        .upsert({
          user_id: user.id,
          application_status: "submitted",
          vehicle_type: form.vehicleType,
          plate_number: form.plateNumber,
          vehicle_color: form.vehicleColor,
          operating_zone: form.zone,
          bank_name: form.bankName,
          bank_code: form.bankCode,
          account_number: form.accountNumber,
          account_name: form.accountName,
          online: false,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" })
        .select("id")
        .single();

      if (profile.error) throw profile.error;

      await Promise.all(
        Object.values(docs).map((doc) =>
          supabase.from("rider_documents").insert({
            rider_profile_id: profile.data.id,
            document_type: doc.type,
            file_url: doc.url,
            status: "submitted"
          })
        )
      );

      setSubmitted(true);
    } catch {
      localStorage.setItem(
        "fastfleet.next.rider_application",
        JSON.stringify({ form, docs, application_status: "submitted", created_at: new Date().toISOString() })
      );
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (!authReady) {
    return <Card className="mx-auto h-96 max-w-3xl animate-pulse bg-white" />;
  }

  if (!signedIn) {
    return (
      <div className="grid gap-6 lg:grid-cols-[0.86fr_1.14fr]">
        <Card className="p-5">
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Driver registration</span>
          <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Register as a driver.</h1>
          <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
            This creates your FastFleet driver account first, then brings you back here to finish KYC, vehicle, document, and banking setup.
          </p>
          <div className="mt-5 grid gap-3 rounded-fleet bg-fleet-paper p-4 text-sm font-bold text-slate-600">
            <span>Driver dashboard access</span>
            <span>Job notifications and online status</span>
            <span>Earnings wallet and withdrawals after approval</span>
          </div>
        </Card>
        <PhoneAuthForm
          title="Create driver account"
          description="Create your driver account with email verification. After login, your driver dashboard opens and asks you to complete KYC."
          defaultRole="rider"
          lockedRole="rider"
          returnToOverride="/rider/dashboard"
          intent="signup"
        />
      </div>
    );
  }

  if (submitted) {
    return (
      <Card className="mx-auto max-w-3xl p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <StatusBadge tone="amber" className="mt-5">
          Submitted
        </StatusBadge>
        <h1 className="mt-3 text-3xl font-black text-fleet-night sm:text-4xl">Your rider application is under review.</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          FastFleet does not auto approve riders. Operations can move this application to under review, approved, rejected, or more info required.
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/rider/dashboard" variant="secondary">
            Open rider dashboard
          </LinkButton>
          <LinkButton href="/support">Contact support</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="p-5">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Rider application</span>
        <h1 className="mt-3 text-4xl font-black leading-tight text-fleet-night sm:text-5xl">Drive with FastFleet.</h1>
        <p className="mt-3 text-sm font-semibold leading-7 text-slate-600">
          Complete identity, vehicle, document, and banking details for a manual operations review.
        </p>
        <div className="mt-6 rounded-fleet bg-fleet-paper p-3">
          <div className="flex justify-between text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            <span>{steps[current]}</span>
            <span>{completion}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white">
            <div className="h-2 rounded-full bg-fleet-ember transition-all" style={{ width: `${completion}%` }} />
          </div>
        </div>
        <div className="mt-5 grid gap-2">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => openStep(index)}
              disabled={index > furthestAllowedStep}
              className={`flex items-center justify-between rounded-fleet px-3 py-3 text-left text-sm font-black transition ${
                current === index ? "bg-fleet-night text-white" : "bg-white text-slate-600 hover:bg-fleet-paper"
              } disabled:cursor-not-allowed disabled:opacity-45`}
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
          <StepShell icon={UserRound} title="Personal information">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" value={form.fullName} onChange={(value) => update("fullName", value)} placeholder="Your legal name" />
              <Field label="Phone number" value={form.phone} onChange={(value) => update("phone", value)} placeholder="+234..." />
              <Field label="Address" value={form.address} onChange={(value) => update("address", value)} placeholder="Residential address" wide />
              <label className="form-field sm:col-span-2">
                <span className="form-label">Preferred operating zone</span>
                <select className="form-input" value={form.zone} onChange={(event) => update("zone", event.target.value)}>
                  {zones.map((zone) => (
                    <option key={zone}>{zone}</option>
                  ))}
                </select>
              </label>
            </div>
          </StepShell>
        ) : null}

        {current === 1 ? (
          <StepShell icon={Bike} title="Vehicle information">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Vehicle type</span>
                <select className="form-input" value={form.vehicleType} onChange={(event) => update("vehicleType", event.target.value as VehicleType)}>
                  <option value="bike">Bike</option>
                  <option value="car">Car</option>
                  <option value="van">Van</option>
                </select>
              </label>
              <Field label="Plate number" value={form.plateNumber} onChange={(value) => update("plateNumber", value)} placeholder="ABC-123XY" />
              <Field label="Vehicle color" value={form.vehicleColor} onChange={(value) => update("vehicleColor", value)} placeholder="Black" />
            </div>
          </StepShell>
        ) : null}

        {current === 2 ? (
          <StepShell icon={IdCard} title="Document uploads">
            <div className="grid gap-4 sm:grid-cols-2">
              {documentTypes.map(([type, label]) => (
                <DocumentDropzone key={type} type={type} label={label} doc={docs[type]} onFile={handleFile} />
              ))}
            </div>
          </StepShell>
        ) : null}

        {current === 3 ? (
          <StepShell icon={Banknote} title="Banking setup">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="form-field">
                <span className="form-label">Bank</span>
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
                  {banks.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Account number"
                value={form.accountNumber}
                onChange={(value) => {
                  update("accountNumber", value.replace(/\D/g, "").slice(0, 10));
                  update("accountName", "");
                }}
                placeholder="0123456789"
              />
              <Field label="Verified account name" value={form.accountName} onChange={(value) => update("accountName", value)} placeholder="Auto verification result" wide readOnly />
            </div>
            <div className="mt-5 rounded-fleet border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              {bankLoading ? "Checking Paystack for the account name..." : bankMessage || "Select a bank and enter a 10-digit account number to verify the account name automatically."}
            </div>
          </StepShell>
        ) : null}

        {current === 4 ? (
          <StepShell icon={CheckCircle2} title="Application review">
            <div className="grid gap-3">
              <ReviewRow label="Name" value={form.fullName || "Not provided"} />
              <ReviewRow label="Zone" value={form.zone} />
              <ReviewRow label="Vehicle" value={`${form.vehicleType} / ${form.plateNumber || "No plate"}`} />
              <ReviewRow label="Bank" value={`${form.bankName || "Bank"} / ${form.accountNumber || "No account"}`} />
              <ReviewRow label="Documents" value={`${Object.keys(docs).length} of ${documentTypes.length} uploaded`} />
              <ReviewRow label="Status" value="submitted after final confirmation" />
            </div>
            {message ? <div className="mt-5 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
          </StepShell>
        ) : null}

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" disabled={current === 0 || loading} onClick={() => setCurrent((value) => Math.max(0, value - 1))}>
            Back
          </Button>
          {current < steps.length - 1 ? (
            <Button type="button" onClick={nextStep}>
              Continue
            </Button>
          ) : (
            <Button type="button" disabled={loading || !stepComplete.slice(0, 4).every(Boolean)} onClick={submitApplication}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Submit for review
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function StepShell({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div>
      <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white">
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
  wide,
  readOnly
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  wide?: boolean;
  readOnly?: boolean;
}) {
  return (
    <label className={`form-field ${wide ? "sm:col-span-2" : ""}`}>
      <span className="form-label">{label}</span>
      <input className="form-input" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} readOnly={readOnly} />
    </label>
  );
}

function DocumentDropzone({
  type,
  label,
  doc,
  onFile
}: {
  type: string;
  label: string;
  doc?: UploadedDoc;
  onFile: (type: string, file: File) => void;
}) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(type, file);
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
      className="grid min-h-48 cursor-pointer place-items-center rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-4 text-center transition hover:border-fleet-gold hover:bg-white"
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <input className="sr-only" type="file" accept="image/*,application/pdf" capture={type === "selfie" ? "user" : undefined} onChange={handleChange} />
      <span className="grid h-11 w-11 place-items-center rounded-full bg-white text-fleet-ember shadow-lift">
        {type === "selfie" ? <Camera className="h-5 w-5" /> : <FileUp className="h-5 w-5" />}
      </span>
      <span>
        <strong className="mt-3 block text-sm font-black text-fleet-night">{label}</strong>
        <span className="mt-1 block text-xs font-semibold text-slate-500">Drag, drop, browse, or use camera</span>
      </span>
      {doc ? (
        <span className="mt-3 block w-full">
          <span className="block truncate text-xs font-bold text-slate-600">{doc.name}</span>
          <span className="mt-2 block h-2 rounded-full bg-white">
            <span className="block h-2 rounded-full bg-fleet-ember" style={{ width: `${doc.progress}%` }} />
          </span>
        </span>
      ) : null}
    </label>
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
