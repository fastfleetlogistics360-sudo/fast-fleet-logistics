"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { geolocationErrorMessage, getLocationPermissionState, isGeolocationPermissionDenied, requestCurrentPosition } from "@/lib/location/geolocation";
import { readStoredCurrentLocation, writeStoredCurrentLocation, type StoredCurrentLocation } from "@/lib/location/current-location";

type GateState = "idle" | "requesting" | "blocked" | "error" | "ready";

export function LocationPermissionGate() {
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("idle");
  const [message, setMessage] = useState("Fast Fleets 360 needs your location to improve delivery pricing, address suggestions, and live tracking.");
  const requestedRef = useRef(false);
  const locationSkippedPrefixes = ["/admin", "/auth", "/cookies", "/ndpr", "/offline", "/privacy", "/terms", "/waitlist"];
  const skip = locationSkippedPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  useEffect(() => {
    if (skip || requestedRef.current) return;
    requestedRef.current = true;
    void ensureLocation();
  }, [skip]);

  async function ensureLocation() {
    if (skip) return;
    try {
      const permission = await getLocationPermissionState();
      if (permission === "unsupported") {
        setState("ready");
        return;
      }
      if (permission === "denied") {
        setState("blocked");
        setMessage("Location is blocked. Enable location for Fast Fleets 360 in your browser or phone settings, then try again.");
        return;
      }

      setState(permission === "granted" ? "idle" : "requesting");
      const position = await requestCurrentPosition();
      const address = await reverseGeocode(position);
      const currentLocation = {
        address,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString()
      };
      writeStoredCurrentLocation(currentLocation);
      void saveCurrentLocation(currentLocation);
      setState("ready");
    } catch (error) {
      const nextMessage = geolocationErrorMessage(error);
      if (!isGeolocationPermissionDenied(error)) {
        const stored = readStoredCurrentLocation();
        if (!stored) setMessage(nextMessage);
        setState("ready");
        return;
      }
      setMessage(nextMessage);
      setState("blocked");
    }
  }

  if (skip || state === "idle" || state === "ready") return null;

  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-fleet-night/78 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Location access required">
      <div className="w-full max-w-md rounded-fleet border border-white/15 bg-white p-5 text-fleet-night shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-6">
        <span className={`grid h-12 w-12 place-items-center rounded-fleet ${state === "requesting" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>
          {state === "requesting" ? <Loader2 className="h-6 w-6 animate-spin" /> : <AlertTriangle className="h-6 w-6" />}
        </span>
        <h2 className="mt-4 text-2xl font-black leading-tight text-fleet-night">{state === "blocked" ? "Location access is blocked" : "Enable location access"}</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        <Button type="button" className="mt-5 w-full" onClick={() => ensureLocation()} disabled={state === "requesting"}>
          {state === "requesting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Enable location
        </Button>
        {state !== "requesting" ? (
          <Button type="button" variant="secondary" className="mt-3 w-full" onClick={() => setState("ready")}>
            Continue without exact location
          </Button>
        ) : null}
      </div>
    </div>
  );
}

async function reverseGeocode(position: GeolocationPosition) {
  const params = new URLSearchParams({
    latitude: String(position.coords.latitude),
    longitude: String(position.coords.longitude)
  });
  const response = await fetch(`/api/maps/reverse-geocode?${params.toString()}`, { cache: "no-store" });
  const data = (await response.json().catch(() => ({}))) as { address?: string };
  return response.ok && data.address ? data.address : "Current detected address";
}

async function saveCurrentLocation(location: StoredCurrentLocation) {
  await fetch("/api/location/current", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: location.address,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? null,
      source: "foreground_gate"
    }),
    keepalive: true
  }).catch(() => undefined);
}
