"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, CreditCard, Loader2, MapPin, Package, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fareSpeedTypes, fareVehicleTypes, speedLabel, vehicleLabel } from "@/lib/fare";
import { formatMoney } from "@/lib/format";
import type { DeliverySpeed, FareEstimate, VehicleType } from "@/types/domain";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AddressAutocompleteInput, type AddressSelection } from "@/components/location/address-autocomplete-input";
import { RoutePreview } from "@/components/maps/route-preview";
import { StatusBadge } from "@/components/ui/status-badge";
import { sanitizeAddressText, isUsableAddressText } from "@/lib/location/address-formatting";
import { currentLocationUpdatedEvent, readStoredCurrentLocation, type StoredCurrentLocation } from "@/lib/location/current-location";
import { extractNigerianState } from "@/lib/location/state-matching";

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

type BookingPayment = "card" | "wallet" | "transfer";

type BookingForm = {
  pickup: string;
  pickupState: string;
  pickupPlaceId: string;
  pickupLatitude: number | null;
  pickupLongitude: number | null;
  pickupContact: string;
  dropoff: string;
  dropoffState: string;
  dropoffPlaceId: string;
  dropoffLatitude: number | null;
  dropoffLongitude: number | null;
  dropoffContact: string;
  parcel: string;
  vehicle: VehicleType | "";
  speed: DeliverySpeed | "";
  scheduledAt: string;
  payment: BookingPayment | "";
  note: string;
};

type BookingEstimate = FareEstimate & {
  routeType?: string;
  routeSource?: string;
  bicycleEligible?: boolean;
  vehicleSubtype?: string | null;
  originalDeliveryFee?: number;
  originalPlatformFee?: number;
  originalTotal?: number;
  launchPromo?: {
    applied?: boolean;
    eligible?: boolean;
    reason?: string | null;
    totalDiscount?: number;
    deliveryDiscount?: number;
    platformFeeDiscount?: number;
    remainingRedemptions?: number;
    maxRedemptions?: number;
    discountCapNgn?: number;
  } | null;
};

export function BookingFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickupAutofillEnabled, setPickupAutofillEnabled] = useState(() => !searchParams.get("pickup")?.trim());
  const [estimate, setEstimate] = useState<BookingEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const initialPickup = sanitizeAddressText(searchParams.get("pickup") || "");
  const initialDropoff = sanitizeAddressText(searchParams.get("dropoff") || "");
  const [form, setForm] = useState<BookingForm>({
    pickup: initialPickup,
    pickupState: extractNigerianState(initialPickup),
    pickupPlaceId: "",
    pickupLatitude: null,
    pickupLongitude: null,
    pickupContact: "",
    dropoff: initialDropoff,
    dropoffState: extractNigerianState(initialDropoff),
    dropoffPlaceId: "",
    dropoffLatitude: null,
    dropoffLongitude: null,
    dropoffContact: "",
    parcel: "",
    vehicle: "",
    speed: "",
    scheduledAt: "",
    payment: "",
    note: ""
  });

  const selectedVehicle = isVehicleType(form.vehicle) ? form.vehicle : null;
  const selectedSpeed = isDeliverySpeed(form.speed) ? form.speed : null;
  const pickup = sanitizeAddressText(form.pickup);
  const dropoff = sanitizeAddressText(form.dropoff);
  const estimateReady = Boolean(isUsableAddressText(pickup) && isUsableAddressText(dropoff) && form.parcel.trim() && selectedVehicle && selectedSpeed && (selectedSpeed !== "scheduled" || form.scheduledAt));
  const quoteReady = estimateReady && Boolean(estimate) && !estimateLoading;

  function update<K extends keyof BookingForm>(key: K, value: BookingForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }

  useEffect(() => {
    if (!pickupAutofillEnabled) return;

    function applyCurrentPickup(location: StoredCurrentLocation | null) {
      const address = sanitizeAddressText(location?.address || "");
      if (!isUsableAddressText(address)) return;
      setForm((previous) => (previous.pickup.trim() ? previous : { ...previous, pickup: address, pickupState: extractNigerianState(address) }));
    }

    applyCurrentPickup(readStoredCurrentLocation());

    function handleLocationUpdate(event: Event) {
      applyCurrentPickup((event as CustomEvent<StoredCurrentLocation>).detail || null);
    }

    window.addEventListener(currentLocationUpdatedEvent, handleLocationUpdate);
    return () => window.removeEventListener(currentLocationUpdatedEvent, handleLocationUpdate);
  }, [pickupAutofillEnabled]);

  useEffect(() => {
    if (!estimateReady || !selectedVehicle || !selectedSpeed) {
      setEstimate(null);
      setEstimateLoading(false);
      setEstimateError(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setEstimateLoading(true);
      setEstimateError(null);
      try {
        const response = await fetch("/api/deliveries/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup,
            pickupState: form.pickupState || extractNigerianState(pickup),
            pickupPlaceId: form.pickupPlaceId || undefined,
            pickupLatitude: form.pickupLatitude,
            pickupLongitude: form.pickupLongitude,
            dropoff,
            dropoffState: form.dropoffState || extractNigerianState(dropoff),
            dropoffPlaceId: form.dropoffPlaceId || undefined,
            dropoffLatitude: form.dropoffLatitude,
            dropoffLongitude: form.dropoffLongitude,
            parcel: form.parcel,
            vehicle: selectedVehicle,
            speed: selectedSpeed
          }),
          signal: controller.signal
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Could not calculate route estimate.");
        setEstimate(payload as BookingEstimate);
      } catch (error) {
        if (controller.signal.aborted) return;
        setEstimate(null);
        setEstimateError(error instanceof Error ? error.message : "Could not calculate route estimate.");
      } finally {
        if (!controller.signal.aborted) setEstimateLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    dropoff,
    estimateReady,
    form.dropoffLatitude,
    form.dropoffLongitude,
    form.dropoffPlaceId,
    form.dropoffState,
    form.parcel,
    form.pickupLatitude,
    form.pickupLongitude,
    form.pickupPlaceId,
    form.pickupState,
    pickup,
    selectedSpeed,
    selectedVehicle
  ]);

  function next() {
    setCurrent((value) => Math.min(value + 1, steps.length - 1));
  }

  function back() {
    setCurrent((value) => Math.max(value - 1, 0));
  }

  async function confirmDelivery() {
    if (estimateLoading || !estimate || !selectedVehicle || !selectedSpeed || !form.payment) {
      setErrorMessage("Complete pickup, drop-off, parcel, vehicle, speed, and payment before confirming.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/deliveries/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          pickup,
          pickupState: form.pickupState || extractNigerianState(pickup),
          pickupPlaceId: form.pickupPlaceId || undefined,
          pickupLatitude: form.pickupLatitude,
          pickupLongitude: form.pickupLongitude,
          dropoff,
          dropoffState: form.dropoffState || extractNigerianState(dropoff),
          dropoffPlaceId: form.dropoffPlaceId || undefined,
          dropoffLatitude: form.dropoffLatitude,
          dropoffLongitude: form.dropoffLongitude,
          vehicle: selectedVehicle,
          speed: selectedSpeed,
          total: estimate.total
        })
      });
      const payload = await response.json();
      if (response.status === 401) {
        router.push("/auth?returnTo=/book");
        return;
      }
      if (!response.ok) throw new Error(payload.error || "Could not create delivery checkout.");

      if (payload.authorizationUrl) {
        window.location.assign(payload.authorizationUrl);
        return;
      }

      setDeliveryCode(payload.deliveryCode);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Delivery checkout failed.");
    } finally {
      setLoading(false);
    }
  }

  const currentStepComplete = isBookingStepComplete(current, form, quoteReady);
  const currentStepPrompt = bookingStepPrompt(current);

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
              ? " Wallet checkout payment was recorded successfully, and online drivers are being notified."
              : " Realtime assignment will update after Squad confirms payment."}
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
      <Card className="relative z-20 !overflow-visible p-4 sm:p-6">
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
              onValue={(value) => {
                setPickupAutofillEnabled(false);
                setForm((previous) => ({ ...previous, pickup: value, pickupState: extractNigerianState(value), pickupPlaceId: "", pickupLatitude: null, pickupLongitude: null }));
              }}
              onSelect={(selection) => {
                setPickupAutofillEnabled(false);
                setForm((previous) => ({
                  ...previous,
                  pickup: selection.address,
                  pickupState: selection.state || extractNigerianState(selection.address),
                  pickupPlaceId: selection.source === "google" ? selection.placeId || "" : "",
                  pickupLatitude: selection.latitude ?? null,
                  pickupLongitude: selection.longitude ?? null
                }));
              }}
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
              onValue={(value) => setForm((previous) => ({ ...previous, dropoff: value, dropoffState: extractNigerianState(value), dropoffPlaceId: "", dropoffLatitude: null, dropoffLongitude: null }))}
              onSelect={(selection) =>
                setForm((previous) => ({
                  ...previous,
                  dropoff: selection.address,
                  dropoffState: selection.state || extractNigerianState(selection.address),
                  dropoffPlaceId: selection.source === "google" ? selection.placeId || "" : "",
                  dropoffLatitude: selection.latitude ?? null,
                  dropoffLongitude: selection.longitude ?? null
                }))
              }
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
          {current === 5 ? estimate && selectedVehicle && selectedSpeed ? <EstimatePanel estimate={estimate} vehicle={selectedVehicle} speed={selectedSpeed} /> : <PendingEstimatePanel loading={estimateLoading} error={estimateError} /> : null}
          {current === 6 ? (
            <ChoiceGrid
              icon={CreditCard}
              title="Payment"
              value={form.payment}
              options={[
                { value: "card", label: "Card", body: "Pay securely on Squad with your debit or credit card." },
                { value: "wallet", label: "Wallet", body: "Pay from funded Fast Fleets 360 customer balance." },
                { value: "transfer", label: "Transfer", body: "Use Squad bank transfer and dispatch after confirmation." }
              ]}
              onChange={(value) => update("payment", value as "card" | "wallet" | "transfer")}
            />
          ) : null}
          {current === 7 ? (
            <div className="grid gap-4">
              {estimate && selectedVehicle && selectedSpeed ? <EstimatePanel estimate={estimate} vehicle={selectedVehicle} speed={selectedSpeed} /> : <PendingEstimatePanel loading={estimateLoading} error={estimateError} />}
              <label className="form-field">
                <span className="form-label">Rider note optional</span>
                <textarea className="form-textarea" value={form.note} onChange={(event) => update("note", event.target.value)} placeholder="Gate code, package instruction, preferred pickup contact" />
              </label>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-fleet border border-rose-200 bg-rose-50 p-3 text-sm font-bold leading-6 text-rose-700">
            {errorMessage}
            {form.payment === "wallet" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <LinkButton href="/dashboard#wallet" size="sm" variant="secondary">Top up wallet</LinkButton>
                <Button type="button" size="sm" variant="secondary" onClick={() => update("payment", "card")}>Use card</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => update("payment", "transfer")}>Use transfer</Button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button type="button" variant="secondary" onClick={back} disabled={current === 0 || loading}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {current < steps.length - 1 ? (
            <Button type="button" onClick={next} disabled={loading || !currentStepComplete}>
              Continue
              <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={confirmDelivery} disabled={loading || estimateLoading || !currentStepComplete || !estimate}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Confirm order
            </Button>
          )}
        </div>
        {!currentStepComplete ? <p className="mt-3 text-sm font-bold text-slate-500">{currentStepPrompt}</p> : null}
      </Card>

      <aside className="grid gap-4">
        <RoutePreview label="FastFleets 360 route preview" pickupAddress={form.pickup} dropoffAddress={form.dropoff} />
        {estimate && selectedVehicle && selectedSpeed ? (
          <Card className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Delivery summary</span>
                <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(estimate.total)}</strong>
              </div>
              <StatusBadge tone="green">{estimate.etaMinutes} min ETA</StatusBadge>
            </div>
            <div className="mt-5 grid gap-3">
              {estimate.launchPromo?.applied && estimate.originalTotal ? <SummaryRow label="Original total" value={formatMoney(estimate.originalTotal)} muted /> : null}
              <SummaryRow label="Distance" value={`${estimate.distanceKm.toFixed(1)} km`} />
              <SummaryRow label="Vehicle" value={vehicleLabel(selectedVehicle)} />
              <SummaryRow label="Speed" value={speedLabel(selectedSpeed)} />
              <SummaryRow label="Delivery fee" value={formatMoney(estimate.deliveryFee)} />
              <SummaryRow label="Platform fee" value={formatMoney(estimate.platformFee)} />
              {estimate.launchPromo?.applied ? <SummaryRow label="Launch promo" value={`-${formatMoney(estimate.launchPromo.totalDiscount || 0)}`} highlight /> : null}
            </div>
          </Card>
        ) : (
          <PendingSummaryCard />
        )}
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
  onSelect,
  onContact,
  placeholder
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  contact: string;
  onValue: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  onContact: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="grid gap-4">
      <span className="grid h-12 w-12 place-items-center rounded-fleet bg-fleet-night text-white">
        <Icon className="h-5 w-5" />
      </span>
      <AddressAutocompleteInput label={label} value={value} onChange={onValue} onSelect={onSelect} placeholder={placeholder} />
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

function PendingEstimatePanel({ loading = false, error }: { loading?: boolean; error?: string | null }) {
  return (
    <div className="rounded-fleet border border-dashed border-fleet-line bg-white p-5 shadow-[0_14px_36px_rgba(8,17,31,0.05)]">
      <StatusBadge tone={error ? "red" : loading ? "blue" : "neutral"}>{error ? "Route needed" : loading ? "Calculating route" : "Estimate pending"}</StatusBadge>
      <h2 className="mt-3 text-2xl font-black text-fleet-night">{error ? "Google could not quote this route yet." : loading ? "Checking the real route distance." : "Complete the booking details first."}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        {error || "Add pickup, drop-off, parcel type, vehicle, and speed to see a real Fast Fleets 360 estimate."}
      </p>
    </div>
  );
}

function EstimatePanel({ estimate, vehicle, speed }: { estimate: BookingEstimate; vehicle: VehicleType; speed: DeliverySpeed }) {
  return (
    <div className="rounded-fleet border border-fleet-line bg-white p-5 shadow-[0_14px_36px_rgba(8,17,31,0.07)]">
      <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Fare estimate</span>
      <strong className="mt-2 block text-4xl font-black text-fleet-night">{formatMoney(estimate.total)}</strong>
      {estimate.launchPromo?.applied && estimate.originalTotal ? (
        <p className="mt-2 text-sm font-black text-emerald-700">
          Launch promo applied. Original total <span className="text-slate-500 line-through">{formatMoney(estimate.originalTotal)}</span>
        </p>
      ) : estimate.launchPromo && !estimate.launchPromo.applied && estimate.launchPromo.reason ? (
        <p className="mt-2 text-sm font-bold text-slate-500">{estimate.launchPromo.reason}</p>
      ) : null}
      <div className="mt-5 grid gap-3">
        <SummaryRow label="Delivery fee" value={formatMoney(estimate.deliveryFee)} />
        <SummaryRow label="Platform fee" value={formatMoney(estimate.platformFee)} />
        {estimate.launchPromo?.applied ? <SummaryRow label="Launch promo" value={`-${formatMoney(estimate.launchPromo.totalDiscount || 0)}`} highlight /> : null}
        <SummaryRow label="ETA" value={`${estimate.etaMinutes} minutes`} />
        <SummaryRow label="Route distance" value={`${estimate.distanceKm.toFixed(1)} km`} />
        <SummaryRow label="Vehicle" value={vehicleLabel(vehicle)} />
        {estimate.vehicleSubtype === "bicycle" ? <SummaryRow label="Fleet match" value="Bicycle light-delivery discount" /> : null}
        <SummaryRow label="Speed" value={speedLabel(speed)} />
      </div>
    </div>
  );
}

function PendingSummaryCard() {
  return (
    <Card className="p-5">
      <StatusBadge tone="neutral">No estimate yet</StatusBadge>
      <h2 className="mt-3 text-2xl font-black text-fleet-night">Complete pickup, drop-off, parcel, vehicle, and speed.</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
        Your delivery fee will appear here only after the required choices are filled.
      </p>
    </Card>
  );
}

function SummaryRow({ label, value, highlight = false, muted = false }: { label: string; value: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-4 rounded-fleet px-3 py-2 text-sm ${highlight ? "bg-emerald-50 text-emerald-700" : "bg-fleet-paper"}`}>
      <span className={`font-bold ${highlight ? "text-emerald-700" : "text-slate-500"}`}>{label}</span>
      <strong className={`text-right font-black ${highlight ? "text-emerald-700" : muted ? "text-slate-500 line-through" : "text-fleet-night"}`}>{value}</strong>
    </div>
  );
}

function isVehicleType(value: string): value is VehicleType {
  return fareVehicleTypes.includes(value as VehicleType);
}

function isDeliverySpeed(value: string): value is DeliverySpeed {
  return fareSpeedTypes.includes(value as DeliverySpeed);
}

function isBookingStepComplete(index: number, form: BookingForm, estimateReady: boolean) {
  if (index === 0) return isUsableAddressText(sanitizeAddressText(form.pickup));
  if (index === 1) return isUsableAddressText(sanitizeAddressText(form.dropoff));
  if (index === 2) return Boolean(form.parcel.trim());
  if (index === 3) return isVehicleType(form.vehicle);
  if (index === 4) return isDeliverySpeed(form.speed) && (form.speed !== "scheduled" || Boolean(form.scheduledAt));
  if (index === 5) return estimateReady;
  if (index === 6) return Boolean(form.payment);
  if (index === 7) return estimateReady && Boolean(form.payment);
  return true;
}

function bookingStepPrompt(index: number) {
  if (index === 0) return "Add a pickup address to continue.";
  if (index === 1) return "Add a drop-off address to continue.";
  if (index === 2) return "Choose the parcel type to continue.";
  if (index === 3) return "Choose the delivery vehicle to continue.";
  if (index === 4) return "Choose delivery speed to continue.";
  if (index === 5) return "Complete pickup, drop-off, parcel, vehicle, and speed to see the estimate.";
  if (index === 6) return "Choose a payment method to continue.";
  return "Complete the required booking details before confirming.";
}
