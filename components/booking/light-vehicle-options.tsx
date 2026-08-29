"use client";

import { Bike, CircleAlert, Clock3 } from "lucide-react";
import { formatMoney } from "@/lib/format";

export type LightVehicleOption = {
  id: "bicycle" | "motorcycle";
  label: string;
  description: string;
  total: number;
  deliveryFee: number;
  etaMinutes: number;
  availability: {
    status: "available" | "limited" | "unavailable";
    label: string;
    riderEtaMinutes: number | null;
  };
};

export function LightVehicleOptions({
  options,
  selectedId,
  loading,
  error,
  onSelect
}: {
  options: LightVehicleOption[];
  selectedId: string;
  loading: boolean;
  error?: string | null;
  onSelect: (option: LightVehicleOption) => void;
}) {
  if (loading) return <div className="rounded-fleet border border-dashed border-fleet-line bg-fleet-paper p-3 text-xs font-bold text-slate-600">Checking live Bicycle and Bike availability…</div>;
  if (error) return <div className="rounded-fleet bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">{error}</div>;
  if (!options.length) return <div className="rounded-fleet bg-fleet-paper p-3 text-xs font-bold text-slate-500">Add your items and delivery address to see Bicycle and Bike prices.</div>;

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-sky-50 text-sky-700"><Bike className="h-4 w-4" /></span>
        <span>
          <strong className="block text-sm font-black text-fleet-night">Choose your rider option</strong>
          <span className="block text-xs font-semibold text-slate-500">Fast Fleets assigns the rider after payment.</span>
        </span>
      </div>
      <div className="mt-3 grid gap-2">
        {options.map((option) => {
          const unavailable = option.availability.status === "unavailable";
          const selected = selectedId === option.id;
          return <button key={option.id} type="button" disabled={unavailable} onClick={() => onSelect(option)} className={`rounded-fleet border p-3 text-left transition ${selected ? "border-fleet-ember bg-orange-50 shadow-[0_10px_22px_rgba(244,126,24,0.12)]" : unavailable ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60" : "border-fleet-line bg-white hover:border-fleet-gold"}`}>
            <div className="flex items-start justify-between gap-3"><span><strong className="block text-sm font-black text-fleet-night">{option.label}</strong><span className="mt-0.5 block text-xs font-semibold leading-5 text-slate-600">{option.description}</span></span><span className="shrink-0 text-right"><strong className="block text-sm font-black text-fleet-night">{formatMoney(option.deliveryFee)}</strong><span className="text-[0.65rem] font-bold uppercase tracking-[0.08em] text-slate-500">Delivery</span></span></div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs font-bold"><span className={unavailable ? "text-rose-700" : option.availability.status === "limited" ? "text-amber-700" : "text-emerald-700"}>{unavailable ? <CircleAlert className="mr-1 inline h-3.5 w-3.5" /> : null}{option.availability.label}</span><span className="text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />{option.availability.riderEtaMinutes ? `Rider ~${option.availability.riderEtaMinutes} min` : `${option.etaMinutes} min ETA`}</span></div>
          </button>;
        })}
      </div>
    </div>
  );
}
