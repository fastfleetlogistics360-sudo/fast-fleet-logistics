"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { readStoredCurrentLocation } from "@/lib/location/current-location";
import { extractNigerianState } from "@/lib/location/state-matching";

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
  source?: "google" | "local";
};

type PlaceDetails = {
  address?: string;
  latitude?: number;
  longitude?: number;
  state?: string;
};

export type AddressSelection = {
  address: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  placeId?: string;
  source?: AddressPrediction["source"];
};

type AddressAutocompleteInputProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (selection: AddressSelection) => void;
  placeholder?: string;
};

export function AddressAutocompleteInput({
  label,
  value,
  onChange,
  onSelect,
  placeholder = "Start typing the full street address"
}: AddressAutocompleteInputProps) {
  const inputId = useId();
  const sessionToken = useMemo(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), []);
  const [predictions, setPredictions] = useState<AddressPrediction[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const hasGooglePredictions = predictions.some((prediction) => prediction.source !== "local");

  useEffect(() => {
    const query = value.trim();
    if (query.length < 3 || selectedPlaceId) {
      setPredictions([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const currentLocation = readStoredCurrentLocation();
    const localPredictions = buildLocalAddressPredictions(query, currentLocation);
    setPredictions(localPredictions);
    setOpen(true);

    async function getPredictions() {
      if (window.google && window.google.maps && window.google.maps.places) {
        try {
          const browserPredictions = await fetchBrowserAddressPredictions(query, currentLocation, window.google);
          if (cancelled) return;
          setPredictions(mergePredictions(browserPredictions, localPredictions));
          setOpen(true);
          if (browserPredictions.length) return;
        } catch (error) {
          if (cancelled) return;
          console.error("Google browser address search failed:", error);
        }
      }

      try {
        const fallbackPredictions = await fetchServerAddressPredictions(query, currentLocation, sessionToken, controller.signal);
        if (cancelled) return;
        setPredictions(mergePredictions(fallbackPredictions, localPredictions));
        setOpen(true);
      } catch (error) {
        if (cancelled || controller.signal.aborted) return;
        console.error("Server address autocomplete failed:", error);
        setPredictions(localPredictions);
        setOpen(true);
      }
    }

    const timer = window.setTimeout(() => {
      void getPredictions();
    }, 260);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
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
    const predictedAddress = sanitizeAddressText(prediction.description);
    const predictedState = extractNigerianState(`${prediction.description} ${prediction.secondaryText}`);
    onChange(predictedAddress);
    onSelect?.({
      address: predictedAddress,
      state: predictedState,
      placeId: prediction.placeId,
      source: prediction.source
    });

    if (prediction.source === "local") return;

    try {
      const browserDetails = await fetchBrowserPlaceDetails(prediction.placeId);
      if (browserDetails.address) {
        const address = sanitizeAddressText(browserDetails.address);
        onChange(address);
        onSelect?.({
          ...browserDetails,
          address,
          state: browserDetails.state || extractNigerianState(address) || predictedState,
          placeId: prediction.placeId,
          source: prediction.source
        });
      }
      return;
    } catch {
      // The API route can still resolve details when a server Places key is configured.
    }

    try {
      const params = new URLSearchParams({ placeId: prediction.placeId, sessionToken });
      const response = await fetch(`/api/maps/place-details?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as PlaceDetails;
      if (response.ok && data.address) {
        const address = sanitizeAddressText(data.address);
        onChange(address);
        onSelect?.({
          ...data,
          address,
          state: data.state || extractNigerianState(address) || predictedState,
          placeId: prediction.placeId,
          source: prediction.source
        });
      }
    } catch {
      // The prediction description is still a usable address.
    }
  }

  return (
    <div ref={wrapperRef} className="form-field">
      <label htmlFor={inputId} className="form-label">{label}</label>
      <div className="relative">
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
        {open && predictions.length ? (
          <div className="absolute left-0 right-0 top-full z-[120] mt-2 max-h-80 overflow-y-auto rounded-2xl border border-fleet-line bg-white shadow-[0_18px_48px_rgba(8,17,31,0.16)]">
            {predictions.map((prediction) => (
              <button
                key={prediction.placeId}
                type="button"
                className="flex w-full cursor-pointer items-start gap-3 border-b border-gray-100 px-4 py-3 text-left text-sm text-gray-800 last:border-0 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
                onClick={() => selectPrediction(prediction)}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-50 text-slate-500">
                  <MapPin className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <strong className="block font-black text-fleet-night">
                    <HighlightedAddress text={prediction.mainText} query={value} />
                  </strong>
                  {prediction.secondaryText ? <span className="mt-1 block text-xs font-semibold text-slate-500">{prediction.secondaryText}</span> : null}
                </span>
              </button>
            ))}
            <span className="block border-t border-fleet-line px-4 py-2 text-right text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{hasGooglePredictions ? "Powered by Google" : "Suggested addresses"}</span>
          </div>
        ) : null}
      </div>
    </div>
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
          secondaryText: prediction.structured_formatting?.secondary_text || "",
          source: "google" as const
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
    service.getDetails({ placeId, fields: ["formatted_address", "geometry", "name", "address_components"] }, (place: any | null, status: string) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
        reject(new Error(`Google place details failed: ${status}`));
        return;
      }

      resolve({
        address: place.formatted_address || place.name || "",
        latitude: typeof place.geometry?.location?.lat === "function" ? place.geometry.location.lat() : undefined,
        longitude: typeof place.geometry?.location?.lng === "function" ? place.geometry.location.lng() : undefined,
        state: stateFromLegacyAddressComponents(place.address_components)
      });
    });
  });
}

async function fetchServerAddressPredictions(
  value: string,
  currentLocation: { latitude: number; longitude: number } | null,
  sessionToken: string,
  signal?: AbortSignal
): Promise<AddressPrediction[]> {
  const params = new URLSearchParams({ input: value, sessionToken });
  if (currentLocation) {
    params.set("latitude", String(currentLocation.latitude));
    params.set("longitude", String(currentLocation.longitude));
  }

  const response = await fetch(`/api/maps/address-autocomplete?${params.toString()}`, { cache: "no-store", signal });
  const data = (await response.json()) as { predictions?: AddressPrediction[] };
  if (!response.ok) throw new Error("Server address autocomplete failed.");
  return Array.isArray(data.predictions) ? data.predictions.map((prediction) => ({ ...prediction, source: "google" as const })) : [];
}

function HighlightedAddress({ text, query }: { text: string; query: string }) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return text;
  const index = text.toLowerCase().indexOf(normalizedQuery);
  if (index < 0) return text;

  return (
    <>
      {text.slice(0, index)}
      <span className="text-emerald-700">{text.slice(index, index + normalizedQuery.length)}</span>
      {text.slice(index + normalizedQuery.length)}
    </>
  );
}

function mergePredictions(primary: AddressPrediction[], fallback: AddressPrediction[]) {
  const seen = new Set<string>();
  return [...primary, ...fallback]
    .filter((prediction) => {
      const key = prediction.description.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);
}

function buildLocalAddressPredictions(value: string, currentLocation: { latitude: number; longitude: number; address?: string } | null): AddressPrediction[] {
  const base = titleCase(cleanAddressSeed(value));
  if (!base) return [];
  const hasStreetSuffix = /\b(st|street|road|rd|avenue|ave|close|crescent|drive|dr|lane|ln)\b/i.test(base);
  const stems = hasStreetSuffix ? [base] : [`${base} Street`, `${base} St`, `${base} Road`, `${base} Close`, `${base} Avenue`];
  const currentArea = currentLocation?.address ? currentAddressArea(currentLocation.address) : "";
  const areas = [currentArea, "Lagos, Nigeria", "Alagbado, Lagos", "Agege, Nigeria", "Ota, Ogun"].filter(Boolean);

  return stems.slice(0, 5).map((mainText, index) => ({
    placeId: `local-address-${index}-${mainText.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    description: `${mainText}, ${areas[index % areas.length]}`,
    mainText,
    secondaryText: areas[index % areas.length],
    source: "local" as const
  }));
}

function cleanAddressSeed(value: string) {
  return sanitizeAddressText(value)
    .trim()
    .replace(/\s+/g, " ")
    .replace(/,\s*$/g, "");
}

function titleCase(value: string) {
  return value.replace(/\b([a-z])/gi, (letter) => letter.toUpperCase());
}

function currentAddressArea(address: string) {
  const parts = sanitizeAddressText(address)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.slice(-2).join(", ");
}

function stateFromLegacyAddressComponents(components: Array<{ long_name?: string; short_name?: string; types?: string[] }> | undefined) {
  const area = components?.find((component) => component.types?.includes("administrative_area_level_1"));
  return extractNigerianState(area?.long_name || area?.short_name || "");
}
