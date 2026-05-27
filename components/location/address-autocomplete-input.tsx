"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { readStoredCurrentLocation } from "@/lib/location/current-location";

type AddressPrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

type AddressAutocompleteInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function AddressAutocompleteInput({
  label,
  value,
  onChange,
  placeholder = "Start typing the full street address"
}: AddressAutocompleteInputProps) {
  const inputId = useId();
  const sessionToken = useMemo(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), []);
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    if (value.trim().length < 3 || selectedPlaceId) {
      setPredictions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      const currentLocation = readStoredCurrentLocation();
      const params = new URLSearchParams({ input: value, sessionToken });
      if (currentLocation) {
        params.set("latitude", String(currentLocation.latitude));
        params.set("longitude", String(currentLocation.longitude));
      }

      setLoading(true);
      setHint(null);
      try {
        const response = await fetch(`/api/maps/address-autocomplete?${params.toString()}`, { cache: "no-store" });
        const data = (await response.json()) as { predictions?: AddressPrediction[]; error?: string };
        if (!response.ok) {
          setHint(data.error || "Address suggestions are unavailable right now.");
          setPredictions([]);
          return;
        }
        setPredictions(Array.isArray(data.predictions) ? data.predictions : []);
        setOpen(true);
      } catch {
        setPredictions([]);
        setHint("Address suggestions are unavailable right now.");
      } finally {
        setLoading(false);
      }
    }, 260);

    return () => window.clearTimeout(timer);
  }, [selectedPlaceId, sessionToken, value]);

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  async function selectPrediction(prediction: AddressPrediction) {
    setSelectedPlaceId(prediction.placeId);
    setOpen(false);
    onChange(prediction.description);

    try {
      const params = new URLSearchParams({ placeId: prediction.placeId, sessionToken });
      const response = await fetch(`/api/maps/place-details?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { address?: string; error?: string };
      if (response.ok && data.address) onChange(data.address);
      if (!response.ok && data.error) setHint(data.error);
    } catch {
      // The prediction description is still a usable address.
    }
  }

  return (
    <label ref={wrapperRef} className="form-field relative">
      <span className="form-label">{label}</span>
      <span className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          id={inputId}
          className="form-input pl-10 pr-10"
          value={value}
          onChange={(event) => {
            setSelectedPlaceId(null);
            onChange(event.target.value);
          }}
          onFocus={() => predictions.length && setOpen(true)}
          placeholder={placeholder}
          autoComplete="street-address"
        />
        {loading ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" /> : null}
      </span>
      {open && predictions.length ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_18px_44px_rgba(8,17,31,0.16)]">
          {predictions.map((prediction) => (
            <button
              key={prediction.placeId}
              type="button"
              className="block w-full px-4 py-3 text-left transition hover:bg-fleet-paper focus:bg-fleet-paper focus:outline-none"
              onClick={() => selectPrediction(prediction)}
            >
              <strong className="block text-sm font-black text-fleet-night">{prediction.mainText}</strong>
              {prediction.secondaryText ? <span className="mt-1 block text-xs font-semibold text-slate-500">{prediction.secondaryText}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      {hint ? <span className="text-xs font-bold leading-5 text-amber-700">{hint}</span> : null}
    </label>
  );
}
