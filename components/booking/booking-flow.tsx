"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, CreditCard, Loader2, MapPin, Package, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { estimateFare, speedLabel, vehicleLabel } from "@/lib/fare";
import { formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { DeliverySpeed, VehicleType } from "@/types/domain";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RoutePreview } from "@/components/maps/route-preview";
import { StatusBadge } from "@/components/ui/status-badge";

const steps = [
  "Pickup",
  "Drop-off",
  "Parcel",
  "Vehicle",
  "Speed",
  "Estimate",
  "Payment",
  "Confirm"
];

const parcels = ["Documents", "Retail parcel", "Food and grocery", "Fragile item", "Bulk goods", "Vendor dispatch"];
const vehicles: Array<{ value: VehicleType; label: string; body: string }> = [
  { value: "bike", label: "Bike", body: "Documents, food, light parcels" },
  { value: "car", label: "Car", body: "Medium items, safer handling" },
  { value: "van", label: "Van", body: "Bulk goods, vendor movement" }
];
const speeds: Array<{ value: DeliverySpeed; label: string; body: string }> = [
  { value: "standard", label: "Standard", body: "Best price for routine jobs" },
  { value: "same_day", label: "Same-day", body: "Complete before close of day" },
  { value: "express", label: "Express", body: "Faster dispatch and ETA" },
  { value: "priority", label: "Priority", body: "Top queue, highest urgency" },
  { value: "scheduled", label: "Scheduled", body: "Reserve a future pickup" },
  { value: "interstate", label: "Inter-state", body: "Lagos, Ogun and beyond" }
];

export function BookingFlow() {
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    pickup: "Victoria Island, Lagos",
    pickupContact: "",
    dropoff: "Ikeja GRA, Lagos",
    dropoffContact: "",
    parcel: "Retail parcel",
    vehicle: "bike" as VehicleType,
    speed: "express" as DeliverySpeed,
    scheduledAt: "",
    payment: "card" as "card" | "wallet" | "transfer",
    note: ""
  });

  const estimate = useMemo(
    () =>
      estimateFare({
        pickup: form.pickup,
        dropoff: form.dropoff,
        vehicle: form.vehicle,
        speed: form.speed,
        scheduledAt: form.scheduledAt,
        zone: `${form.pickup} ${form.dropoff}`
      }),
    [form]
  );

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  function next() {
    setCurrent((value) => Math.min(value + 1, steps.length - 1));
  }

  function back() {
    setCurrent((value) => Math.max(value - 1, 0));
  }

  async function confirmDelivery() {
    setLoading(true);
    setErrorMessage(null);
    const code = `FF-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;

    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/auth?returnTo=/book");
        return;
      }

      const result = await supabase.from("deliveries").insert({
        delivery_code: code,
        customer_id: user.id,
        pickup_address: form.pickup,
        dropoff_address: form.dropoff,
        pickup_contact: form.pickupContact,
        dropoff_contact: form.dropoffContact,
        parcel_type: form.parcel,
        vehicle_type: form.vehicle,
        delivery_speed: form.speed,
        payment_method: form.payment,
        status: "pending_payment",
        price_ngn: estimate.total,
        distance_km: estimate.distanceKm,
        eta_minutes: estimate.etaMinutes,
        metadata: {
          note: form.note,
          scheduled_at: form.scheduledAt || null
        }
      }).select("id").single();

      if (result.error) throw result.error;

      if (form.payment === "wallet") {
        const { error: paymentError } = await supabase.rpc("pay_delivery_from_wallet", {
          target_delivery_id: result.data.id,
          next_metadata: {
            source: "booking_checkout",
            delivery_code: code
          }
        });
        if (paymentError) throw paymentError;
      }

      setDeliveryCode(code);
    } catch (error) {
      if (form.payment === "wallet") {
        setErrorMessage(error instanceof Error ? error.message : "Wallet checkout payment failed.");
        setLoading(false);
        return;
      }

      const stored = JSON.parse(localStorage.getItem("fastfleet.next.deliveries") || "[]");
      localStorage.setItem(
        "fastfleet.next.deliveries",
        JSON.stringify([
          {
            delivery_code: code,
            ...form,
            estimate,
            status: "pending_payment",
            created_at: new Date().toISOString()
          },
          ...stored
        ])
      );
      setDeliveryCode(code);
    } finally {
      setLoading(false);
    }
  }

  if (deliveryCode) {
    return (
      <Card className="grid gap-6 p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div>
          <StatusBadge tone="green">Order created</StatusBadge>
          <h1 className="mt-3 text-3xl font-black text-fleet-night">Your delivery is ready for dispatch.</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Tracking code <strong className="text-fleet-night">{deliveryCode}</strong> has been created.
            {form.payment === "wallet"
              ? " Wallet checkout payment was recorded successfully, and dispatch search can begin."
              : " Realtime assignment will update after payment is confirmed."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <LinkButton href={`/track?code=${deliveryCode}`} className="w-full">
            Track delivery
          </LinkButton>
          <LinkButton href="/dashboard" variant="secondary" className="w-full">
            Open dashboard
          </LinkButton>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
      <Card className="p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Book delivery</span>
            <h1 className="mt-2 text-3xl font-black text-fleet-night sm:text-4xl">{steps[current]}</h1>
          </div>
          <StatusBadge tone="blue">
            Step {current + 1} of {steps.length}
          </StatusBadge>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-8">
          {steps.map((step, index) => (
            <button
              key={step}
              type="button"
              onClick={() => setCurrent(index)}
              className={`h-2 rounded-full transition ${index <= current ? "bg-fleet-ember" : "bg-slate-200"}`}
              aria-label={`Go to ${step}`}
            />
          ))}
        </div>

        <div className="mt-6 min-h-[360px]">
          {current === 0 ? (
            <AddressStep
              icon={MapPin}
              label="Pickup location"
              value={form.pickup}
              contact={form.pickupContact}
              onValue={(value) => update("pickup", value)}
              onContact={(value) => update("pickupContact", value)}
              placeholder="Pickup address in Lagos or Ogun"
            />
          ) : null}
          {current === 1 ? (
            <AddressStep
              icon={MapPin}
              label="Delivery location"
              value={form.dropoff}
              contact={form.dropoffContact}
              onValue={(value) => update("dropoff", value)}
              onContact={(value) => update("dropoffContact", value)}
              placeholder="Recipient address"
            />
          ) : null}
          {current === 2 ? (
            <ChoiceGrid
              icon={Package}
              title="Parcel type"
              value={form.parcel}
              options={parcels.map((parcel) => ({ value: parcel, label: parcel, body: "Handled with status updates and delivery proof." }))}
              onChange={(value) => update("parcel", value)}
            />
          ) : null}
          {current === 3 ? (
            <ChoiceGrid
              icon={Truck}
              title="Vehicle selection"
              value={form.vehicle}
              options={vehicles}
              onChange={(value) => update("vehicle", value as VehicleType)}
            />
          ) : null}
          {current === 4 ? (
            <div className="grid gap-4">
              <ChoiceGrid
                icon={CalendarClock}
                title="Delivery speed"
                value={form.speed}
                options={speeds}
                onChange={(value) => update("speed", value as DeliverySpeed)}
              />
              {form.speed === "scheduled" ? (
                <label className="form-field">
                  <span className="form-label">Scheduled pickup</span>
                  <input className="form-input" type="datetime-local" value={form.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} />
                </label>
              ) : null}
            </div>
          ) : null}
          {current === 5 ? <EstimatePanel estimate={estimate} vehicle={form.vehicle} speed={form.speed} /> : null}
          {current === 6 ? (
            <ChoiceGrid
              icon={CreditCard}
              title="Payment"
              value={form.payment}
              options={[
                { value: "card", label: "Card", body: "Charge through your payment provider integration." },
                { value: "wallet", label: "Wallet", body: "Pay from funded FastFleet customer balance." },
                { value: "transfer", label: "Transfer", body: "Confirm bank transfer before dispatch." }
              ]}
              onChange={(value) => update("payment", value as "card" | "wallet" | "transfer")}
            />
          ) : null}
          {current === 7 ? (
            <div className="grid gap-4">
              <EstimatePanel estimate={estimate} vehicle={form.vehicle} speed={form.speed} />
              <label className="form-field">
                <span className="form-label">Rider note optional</span>
                <textarea className="form-textarea" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Gate code, package instruction, preferred pickup contact" />
              </label>
            </div>
          ) : null}
        </div>

        {errorMessage ? <div className="mt-4 rounded-fleet border border-rose-200 bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">{errorMessage}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" onClick={back} disabled={current === 0 || loading}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {current < steps.length - 1 ? (
            <Button type="button" onClick={next}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={confirmDelivery} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm order
            </Button>
          )}
        </div>
      </Card>

      <aside className="grid gap-4">
        <RoutePreview label="Google Maps route preview" pickupAddress={form.pickup} dropoffAddress={form.dropoff} />
        <Card className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Delivery summary</span>
              <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(estimate.total)}</strong>
            </div>
            <StatusBadge tone="green">{estimate.etaMinutes} min ETA</StatusBadge>
          </div>
          <div className="mt-5 grid gap-3">
            <SummaryRow label="Distance" value={`${estimate.distanceKm.toFixed(1)} km`} />
            <SummaryRow label="Vehicle" value={vehicleLabel(form.vehicle)} />
            <SummaryRow label="Speed" value={speedLabel(form.speed)} />
            <SummaryRow label="Platform fee" value={formatMoney(estimate.platformFee)} />
          </div>
        </Card>
      </aside>
    </div>
  );
}

function AddressStep({
  icon: Icon,
  label,
  value,
  contact,
  onValue,
  onContact,
  placeholder
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  contact: string;
  onValue: (value: string) => void;
  onContact: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-4">
      <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white">
        <Icon className="h-5 w-5" />
      </span>
      <label className="form-field">
        <span className="form-label">{label}</span>
        <input className="form-input" value={value} onChange={(event) => onValue(event.target.value)} placeholder={placeholder} />
      </label>
      <label className="form-field">
        <span className="form-label">Contact phone</span>
        <input className="form-input" value={contact} onChange={(event) => onContact(event.target.value)} placeholder="+234..." inputMode="tel" />
      </label>
    </div>
  );
}

function ChoiceGrid<T extends string>({
  icon: Icon,
  title,
  value,
  options,
  onChange
}: {
  icon: LucideIcon;
  title: string;
  value: T;
  options: Array<{ value: T; label: string; body: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white">
        <Icon className="h-5 w-5" />
      </span>
      <h2 className="mt-4 text-xl font-black text-fleet-night">{title}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={`rounded-fleet border p-4 text-left transition ${
                selected ? "border-fleet-ember bg-orange-50 shadow-lift" : "border-fleet-line bg-white hover:border-fleet-gold"
              }`}
            >
              <strong className="block text-sm font-black text-fleet-night">{option.label}</strong>
              <span className="mt-2 block text-xs font-semibold leading-5 text-slate-600">{option.body}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EstimatePanel({ estimate, vehicle, speed }: { estimate: ReturnType<typeof estimateFare>; vehicle: VehicleType; speed: DeliverySpeed }) {
  return (
    <div className="rounded-fleet border border-fleet-line bg-white p-5 shadow-[0_14px_36px_rgba(8,17,31,0.07)]">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Fare breakdown</span>
      <strong className="mt-2 block text-4xl font-black text-fleet-night">{formatMoney(estimate.total)}</strong>
      <div className="mt-5 grid gap-3">
        <SummaryRow label="Base fare" value={formatMoney(estimate.baseFare)} />
        <SummaryRow label="Distance fare" value={formatMoney(estimate.distanceFare)} />
        <SummaryRow label="ETA" value={`${estimate.etaMinutes} minutes`} />
        <SummaryRow label="Route distance" value={`${estimate.distanceKm.toFixed(1)} km`} />
        <SummaryRow label="Vehicle" value={vehicleLabel(vehicle)} />
        <SummaryRow label="Speed" value={speedLabel(speed)} />
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-fleet bg-fleet-paper px-3 py-2 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <strong className="text-right font-black text-fleet-night">{value}</strong>
    </div>
  );
}
