"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, Loader2, MapPin, Package, Phone, Warehouse } from "lucide-react";
import { useRouter } from "next/navigation";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { isUsableAddressText, sanitizeAddressText } from "@/lib/location/address-formatting";

const steps = ["Load", "Route", "Quantity", "Contact", "Time"];

const categories = [
  { value: "building_materials", label: "🧱 Building Materials" },
  { value: "furniture", label: "🛋️ Furniture" },
  { value: "office_equipment", label: "🏢 Office Equipment" },
  { value: "farm_produce", label: "🌾 Farm Produce" },
  { value: "bulk_goods", label: "📦 Bulk Goods" },
  { value: "other_heavy_items", label: "🚚 Other Heavy Items" }
] as const;

const materialOptions = ["Cement", "Blocks", "Sand", "Granite", "Iron Rods", "Roofing Sheets", "Tiles", "Paint", "Wood", "Other"];
const accessOptions = [
  { value: "easy", label: "Easy access" },
  { value: "narrow", label: "Narrow road" },
  { value: "roadside_transfer", label: "Roadside transfer" },
  { value: "not_sure", label: "Not sure" }
] as const;

type Access = (typeof accessOptions)[number]["value"];

type Form = {
  category: string;
  itemType: string;
  pickup: string;
  pickupAccess: Access;
  dropoff: string;
  dropoffAccess: Access;
  quantity: string;
  contactName: string;
  contactPhone: string;
  preferredPickupAt: string;
  instructions: string;
};

const initialForm: Form = {
  category: "",
  itemType: "",
  pickup: "",
  pickupAccess: "not_sure",
  dropoff: "",
  dropoffAccess: "not_sure",
  quantity: "",
  contactName: "",
  contactPhone: "",
  preferredPickupAt: "",
  instructions: ""
};

export function HeavyLogisticsFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestCode, setRequestCode] = useState<string | null>(null);

  function update<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const complete = stepComplete(step, form);

  async function submit() {
    if (!stepComplete(4, form)) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/heavy-logistics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pickup: sanitizeAddressText(form.pickup),
          dropoff: sanitizeAddressText(form.dropoff)
        })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) {
        router.push("/auth?returnTo=/heavy-logistics");
        return;
      }
      if (!response.ok) throw new Error(result.error || "Could not submit request.");
      setRequestCode(result.request?.request_code || null);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Could not submit request.");
    } finally {
      setLoading(false);
    }
  }

  if (requestCode) {
    return (
      <Card className="mx-auto grid max-w-xl gap-5 p-6 text-center sm:p-8">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 className="h-8 w-8" /></span>
        <div>
          <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Request submitted</span>
          <h1 className="mt-2 text-3xl font-black text-fleet-night">{requestCode}</h1>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkButton href={`/heavy-logistics/${requestCode}`} className="w-full">View request</LinkButton>
          <LinkButton href="/hub" variant="secondary" className="w-full">Back to hub</LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Card className="p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-fleet-night text-white"><Warehouse className="h-5 w-5" /></span>
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Heavy Logistics</span>
              <h1 className="text-xl font-black text-fleet-night sm:text-2xl">{steps[step]}</h1>
            </div>
          </div>
          <span className="rounded-full bg-fleet-paper px-3 py-1 text-xs font-black text-fleet-night">{step + 1}/{steps.length}</span>
        </div>

        <div className="mt-5 grid grid-cols-5 gap-2">
          {steps.map((item, index) => <span key={item} className={`h-1.5 rounded-full ${index <= step ? "bg-fleet-ember" : "bg-slate-200"}`} />)}
        </div>

        <div className="mt-6 min-h-[330px]">
          {step === 0 ? <LoadStep form={form} update={update} /> : null}
          {step === 1 ? <RouteStep form={form} update={update} /> : null}
          {step === 2 ? <QuantityStep form={form} update={update} /> : null}
          {step === 3 ? <ContactStep form={form} update={update} /> : null}
          {step === 4 ? <TimeStep form={form} update={update} /> : null}
        </div>

        {error ? <div className="mt-4 rounded-fleet border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" onClick={() => setStep((current) => Math.max(0, current - 1))} disabled={step === 0 || loading}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={() => setStep((current) => current + 1)} disabled={!complete || loading}>Continue <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button type="button" onClick={submit} disabled={!complete || loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Submit request
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function LoadStep({ form, update }: { form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {categories.map((category) => (
          <button key={category.value} type="button" onClick={() => update("category", category.value)} className={`rounded-fleet border px-4 py-4 text-left text-sm font-black transition ${form.category === category.value ? "border-fleet-ember bg-orange-50 text-fleet-night" : "border-fleet-line bg-white text-fleet-night hover:border-fleet-gold"}`}>
            {category.label}
          </button>
        ))}
      </div>
      {form.category === "building_materials" ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {materialOptions.map((item) => <button key={item} type="button" onClick={() => update("itemType", item)} className={`rounded-[14px] border px-3 py-3 text-sm font-black transition ${form.itemType === item ? "border-fleet-ember bg-orange-50" : "border-fleet-line bg-white hover:border-fleet-gold"}`}>{item}</button>)}
        </div>
      ) : form.category ? (
        <label className="form-field"><span className="form-label">Item</span><input className="form-input" value={form.itemType} onChange={(event) => update("itemType", event.target.value)} placeholder="What are you moving?" maxLength={80} /></label>
      ) : null}
    </div>
  );
}

function RouteStep({ form, update }: { form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <AddressAutocompleteInput label="Pickup location" value={form.pickup} onChange={(value) => update("pickup", value)} placeholder="Pickup address" />
        <AddressAutocompleteInput label="Delivery location" value={form.dropoff} onChange={(value) => update("dropoff", value)} placeholder="Delivery address" />
      </div>
      <AccessChoice label="Pickup access" value={form.pickupAccess} onChange={(value) => update("pickupAccess", value)} />
      <AccessChoice label="Delivery access" value={form.dropoffAccess} onChange={(value) => update("dropoffAccess", value)} />
    </div>
  );
}

function AccessChoice({ label, value, onChange }: { label: string; value: Access; onChange: (value: Access) => void }) {
  return <div><span className="form-label">{label}</span><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{accessOptions.map((option) => <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-[14px] border px-2 py-3 text-xs font-black transition ${value === option.value ? "border-fleet-ember bg-orange-50" : "border-fleet-line bg-white hover:border-fleet-gold"}`}>{option.label}</button>)}</div></div>;
}

function QuantityStep({ form, update }: { form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return <div className="grid gap-5"><span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white"><Package className="h-5 w-5" /></span><label className="form-field"><span className="form-label">Estimated quantity</span><input className="form-input" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} placeholder="e.g. 20 bags, 300 blocks, 1 trip" maxLength={100} /></label></div>;
}

function ContactStep({ form, update }: { form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return <div className="grid gap-5"><span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white"><Phone className="h-5 w-5" /></span><div className="grid gap-4 sm:grid-cols-2"><label className="form-field"><span className="form-label">Contact person</span><input className="form-input" value={form.contactName} onChange={(event) => update("contactName", event.target.value)} placeholder="Full name" maxLength={100} /></label><label className="form-field"><span className="form-label">Phone</span><input className="form-input" value={form.contactPhone} onChange={(event) => update("contactPhone", event.target.value)} placeholder="+234..." inputMode="tel" maxLength={30} /></label></div></div>;
}

function TimeStep({ form, update }: { form: Form; update: <K extends keyof Form>(key: K, value: Form[K]) => void }) {
  return <div className="grid gap-5"><span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white"><MapPin className="h-5 w-5" /></span><label className="form-field"><span className="form-label">Preferred pickup time</span><input className="form-input" type="datetime-local" value={form.preferredPickupAt} onChange={(event) => update("preferredPickupAt", event.target.value)} /></label><label className="form-field"><span className="form-label">Special instructions</span><textarea className="form-textarea" value={form.instructions} onChange={(event) => update("instructions", event.target.value)} placeholder="Optional" maxLength={800} /></label></div>;
}

function stepComplete(step: number, form: Form) {
  if (step === 0) return Boolean(form.category && form.itemType.trim());
  if (step === 1) return isUsableAddressText(sanitizeAddressText(form.pickup)) && isUsableAddressText(sanitizeAddressText(form.dropoff));
  if (step === 2) return Boolean(form.quantity.trim());
  if (step === 3) return Boolean(form.contactName.trim() && form.contactPhone.trim().length >= 10);
  return Boolean(form.preferredPickupAt);
}
