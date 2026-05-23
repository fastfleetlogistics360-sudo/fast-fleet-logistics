"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, LocateFixed, MapPin, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type LocationState = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

export function LiveLocationMap() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Enable location to load your live Google Map.");

  const mapUrl = useMemo(() => {
    if (!location) return null;
    const query = `${location.latitude},${location.longitude}`;
    return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
  }, [location]);

  useEffect(() => {
    if (!location || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [location]);

  function enableLocation() {
    if (!navigator.geolocation) {
      setMessage("Your browser does not support location permission.");
      return;
    }

    setLoading(true);
    setMessage("Waiting for location permission...");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        });
        setMessage("Live location enabled.");
        setLoading(false);
      },
      (error) => {
        setMessage(error.code === error.PERMISSION_DENIED ? "Location permission was blocked. Allow it in your browser to load the live map." : "Could not read your location. Try again.");
        setLoading(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
  }

  return (
    <section className="section-wrap py-8 sm:py-12">
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr] lg:items-stretch">
        <Card className="flex flex-col justify-between p-5">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Live location</span>
            <h2 className="mt-3 text-3xl font-black leading-tight text-fleet-night sm:text-4xl">Enable location and see yourself on Google Maps.</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
              This helps customers, drivers, and business dispatchers confirm pickup areas before tracking a delivery.
            </p>
          </div>
          <div className="mt-5 grid gap-3">
            <Button type="button" onClick={enableLocation} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
              Enable location
            </Button>
            <div className="rounded-fleet bg-fleet-paper p-3 text-sm font-bold leading-6 text-slate-600">
              {message}
              {location ? (
                <span className="mt-1 block text-xs text-slate-500">
                  {location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}
                  {location.accuracy ? `, accuracy ${Math.round(location.accuracy)}m` : ""}
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="relative min-h-[340px] overflow-hidden rounded-fleet border border-fleet-line bg-white shadow-[0_18px_48px_rgba(8,17,31,0.08)]">
          {mapUrl ? (
            <iframe
              title="Your live Google Map"
              src={mapUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              allowFullScreen
            />
          ) : (
            <div className="map-grid absolute inset-0">
              <div className="absolute left-1/2 top-1/2 grid h-20 w-20 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-fleet-ember shadow-lift">
                <MapPin className="h-9 w-9" />
              </div>
            </div>
          )}
          <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-fleet border border-white/80 bg-white/92 p-3 shadow-lift backdrop-blur-xl">
            <span className="inline-flex items-center gap-2 text-sm font-black text-fleet-night">
              <Navigation className="h-4 w-4 text-fleet-ember" />
              {location ? "Google Map loaded from your live location" : "Map loads immediately after permission"}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
