"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { geolocationErrorMessage, getLocationPermissionState, requestCurrentPosition } from "@/lib/location/geolocation";
import { writeStoredCurrentLocation } from "@/lib/location/current-location";

type GateState = "idle" | "requesting" | "blocked" | "error" | "ready";

export function LocationPermissionGate() {
  const pathname = usePathname();
  const [state, setState] = useState<GateState>("idle");
  const [message, setMessage] = useState("Fast Fleets 360 needs your location to improve delivery pricing, address suggestions, and live tracking.");
  const requestedRef = useRef(false);
  const skip = pathname.startsWith("/admin");

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
        setState("error");
        setMessage("Location is not available on this browser or device.");
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
      writeStoredCurrentLocation({
        address,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        updatedAt: new Date().toISOString()
      });
      setState("ready");
    } catch (error) {
      const nextMessage = geolocationErrorMessage(error);
      setMessage(nextMessage);
      setState(nextMessage.toLowerCase().includes("denied") ? "blocked" : "error");
    }
  }

  if (skip || state === "idle" || state === "ready") return null;

  return (
    <div className="fixed inset-0 z-[220] grid place-items-center bg-fleet-night/78 px-4 py-8 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Location access required">
      <div className="w-full max-w-md rounded-fleet border border-white/15 bg-white p-5 text-fleet-night shadow-[0_28px_90px_rgba(0,0,0,0.34)] sm:p-6">
        <span className={`grid h-12 w-12 place-items-center rounded-fleet ${state === "requesting" ? "bg-sky-50 text-sky-700" : "bg-amber-50 text-amber-700"}`}>
          {state === "requesting" ? <Loader2 className="h-6 w-6 animate-spin" /> : <AlertTriangle className="h-6 w-6" />}
        </span>
        <h2 className="mt-4 text-2xl font-black leading-tight text-fleet-night">Enable location access</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{message}</p>
        <Button type="button" className="mt-5 w-full" onClick={() => ensureLocation()} disabled={state === "requesting"}>
          {state === "requesting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
          Enable location
        </Button>
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
