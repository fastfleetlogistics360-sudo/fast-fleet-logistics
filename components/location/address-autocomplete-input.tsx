"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { readStoredCurrentLocation } from "@/lib/location/current-location";

declare global {
  interface Window {
    google?: any;
  }
}

type AddressPrediction = {
  placeId: string;
  description: string;
  mainText: string;
  secondaryText: string;
};

type PlaceDetails = {
  address?: string;
  latitude?: number;
  longitude?: number;
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
  const [open, setOpen] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLLabelElement>(null);

  useEffect(() => {
    if (value.trim().length < 3 || selectedPlaceId) {
      setPredictions([]);
      return;
    }

    let cancelled = false;

    async function getPredictions() {
      const currentLocation = readStoredCurrentLocation();

      if (window.google && window.google.maps && window.google.maps.places) {
        try {
          const browserPredictions = await fetchBrowserAddressPredictions(value, currentLocation, window.google);
          if (cancelled) return;
          setPredictions(browserPredictions);
          setOpen(true);
          return;
        } catch (error) {
          console.error("Google browser address search failed:", error);
          if (cancelled) return;
          setPredictions([]);
          setOpen(false);
          return;
        }
      }

      try {
        const fallbackPredictions = await fetchServerAddressPredictions(value, currentLocation, sessionToken);
        if (cancelled) return;
        setPredictions(fallbackPredictions);
        setOpen(true);
      } catch (error) {
        console.error("Server address autocomplete failed:", error);
        if (cancelled) return;
        setPredictions([]);
        setOpen(false);
      }
    }

    void getPredictions();
    return () => {
      cancelled = true;
    };
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
      const browserDetails = await fetchBrowserPlaceDetails(prediction.placeId);
      if (browserDetails.address) onChange(browserDetails.address);
      return;
    } catch {
      // The API route can still resolve details when a server Places key is configured.
    }

    try {
      const params = new URLSearchParams({ placeId: prediction.placeId, sessionToken });
      const response = await fetch(`/api/maps/place-details?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { address?: string };
      if (response.ok && data.address) onChange(data.address);
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
          <span className="block border-t border-fleet-line px-4 py-2 text-right text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">Powered by Google</span>
        </div>
      ) : null}
    </label>
  );
}

async function fetchBrowserAddressPredictions(
  value: string,
  currentLocation: { latitude: number; longitude: number } | null,
  google: any
): Promise<AddressPrediction[]> {
  const service = new google.maps.places.AutocompleteService();
  const request: Record<string, unknown> = {
    input: value,
    componentRestrictions: { country: "ng" },
    types: ["address"]
  };

  if (currentLocation) {
    request.location = new google.maps.LatLng(currentLocation.latitude, currentLocation.longitude);
    request.radius = 80000;
  }

  return new Promise((resolve, reject) => {
    service.getPlacePredictions(request, (results: any[] | null, status: string) => {
      if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
        resolve([]);
        return;
      }
      if (status !== google.maps.places.PlacesServiceStatus.OK) {
        reject(new Error(`Google address autocomplete failed: ${status}`));
        return;
      }

      resolve(
        (results || []).map((prediction) => ({
          placeId: prediction.place_id,
          description: prediction.description,
          mainText: prediction.structured_formatting?.main_text || prediction.description,
          secondaryText: prediction.structured_formatting?.secondary_text || ""
        }))
      );
    });
  });
}

async function fetchBrowserPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const google = window.google;
  if (!google?.maps?.places) throw new Error("Google Places library is not available.");

  const service = new google.maps.places.PlacesService(document.createElement("div"));

  return new Promise((resolve, reject) => {
    service.getDetails({ placeId, fields: ["formatted_address", "geometry", "name"] }, (place: any | null, status: string) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        reject(new Error(`Google place details failed: ${status}`));
        return;
      }

      resolve({
        address: place.formatted_address || place.name || "",
        latitude: typeof place.geometry?.location?.lat === "function" ? place.geometry.location.lat() : undefined,
        longitude: typeof place.geometry?.location?.lng === "function" ? place.geometry.location.lng() : undefined
      });
    });
  });
}

async function fetchServerAddressPredictions(
  value: string,
  currentLocation: { latitude: number; longitude: number } | null,
  sessionToken: string
): Promise<AddressPrediction[]> {
  const params = new URLSearchParams({ input: value, sessionToken });
  if (currentLocation) {
    params.set("latitude", String(currentLocation.latitude));
    params.set("longitude", String(currentLocation.longitude));
  }

  const response = await fetch(`/api/maps/address-autocomplete?${params.toString()}`, { cache: "no-store" });
  const data = (await response.json()) as { predictions?: AddressPrediction[] };
  if (!response.ok) throw new Error("Server address autocomplete failed.");
  return Array.isArray(data.predictions) ? data.predictions : [];
}
