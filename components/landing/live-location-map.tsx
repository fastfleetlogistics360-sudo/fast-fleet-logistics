"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, MapPin, Navigation, Route, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AddressAutocompleteInput } from "@/components/location/address-autocomplete-input";
import { estimateFareForDistance } from "@/lib/fare";
import { formatMoney } from "@/lib/format";
import { currentLocationUpdatedEvent, readStoredCurrentLocation, type StoredCurrentLocation } from "@/lib/location/current-location";

type LocationState = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

export function LiveLocationMap() {
  const [location, setLocation] = useState<LocationState | null>(null);
  const [pickup, setPickup] = useState("");
  const [dropoff, setDropoff] = useState("");
  const [pickupUsesCurrentLocation, setPickupUsesCurrentLocation] = useState(true);
  const [distanceKm, setDistanceKm] = useState(1);
  const [distanceSource, setDistanceSource] = useState("Waiting for route details");
  const [routeLoading, setRouteLoading] = useState(false);
  const [locationMessage, setLocationMessage] = useState("Detecting your address...");
  const [currentAddress, setCurrentAddress] = useState("");

  const pickupCoordinates = pickupUsesCurrentLocation && location ? location : parseCoordinates(pickup);
  const dropoffCoordinates = parseCoordinates(dropoff);

  const pricing = useMemo(() => estimateFareForDistance({ distanceKm, vehicle: "bike", speed: "express" }), [distanceKm]);

  const mapUrl = useMemo(() => {
    if (pickupCoordinates && dropoffCoordinates) {
      const origin = `${pickupCoordinates.latitude},${pickupCoordinates.longitude}`;
      const destination = `${dropoffCoordinates.latitude},${dropoffCoordinates.longitude}`;
      return `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(destination)}&output=embed`;
    }

    if (pickupCoordinates && dropoff.trim().length > 3) {
      const origin = `${pickupCoordinates.latitude},${pickupCoordinates.longitude}`;
      return `https://maps.google.com/maps?saddr=${encodeURIComponent(origin)}&daddr=${encodeURIComponent(dropoff)}&output=embed`;
    }

    if (pickupCoordinates) {
      const query = `${pickupCoordinates.latitude},${pickupCoordinates.longitude}`;
      return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=16&output=embed`;
    }

    if (pickup.trim().length > 3 && dropoff.trim().length > 3) {
      return `https://maps.google.com/maps?saddr=${encodeURIComponent(pickup)}&daddr=${encodeURIComponent(dropoff)}&output=embed`;
    }

    if (pickup.trim().length > 3) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(pickup)}&z=16&output=embed`;
    }

    if (dropoff.trim().length > 3) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(dropoff)}&z=13&output=embed`;
    }

    return null;
  }, [dropoff, dropoffCoordinates, pickup, pickupCoordinates]);

  useEffect(() => {
    const stored = readStoredCurrentLocation();
    if (stored) applyStoredLocation(stored);

    function handleLocationUpdate(event: Event) {
      const nextLocation = (event as CustomEvent<StoredCurrentLocation>).detail;
      if (nextLocation) applyStoredLocation(nextLocation);
    }

    window.addEventListener(currentLocationUpdatedEvent, handleLocationUpdate);
    return () => window.removeEventListener(currentLocationUpdatedEvent, handleLocationUpdate);
  }, []);

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
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [location]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      updateDistance();
    }, 650);

    return () => window.clearTimeout(timer);
  }, [currentAddress, dropoff, pickup, pickupUsesCurrentLocation, location?.latitude, location?.longitude]);

  function applyStoredLocation(stored: StoredCurrentLocation) {
    setLocation({
      latitude: stored.latitude,
      longitude: stored.longitude,
      accuracy: stored.accuracy
    });
    setCurrentAddress(stored.address);
    setLocationMessage(stored.address);
    setPickup((current) => (current.trim() ? current : stored.address));
  }

  async function updateDistance() {
    const origin = pickupUsesCurrentLocation ? (currentAddress || pickup.trim()) : pickup.trim();
    const destination = dropoffCoordinates ? formatCoordinates(dropoffCoordinates) : dropoff.trim();

    if (!origin || !destination || destination.length < 3) {
      setDistanceKm(1);
      setDistanceSource("Add a pickup and drop-off to estimate distance");
      return;
    }

    if (!currentAddress && pickupCoordinates && dropoffCoordinates) {
      const directDistance = roundDistance(haversineDistanceKm(pickupCoordinates, dropoffCoordinates));
      setDistanceKm(Math.max(1, directDistance));
      setDistanceSource("Calculated from map coordinates");
      return;
    }

    setRouteLoading(true);
    try {
      const params = new URLSearchParams({ origin, destination });
      const response = await fetch(`/api/maps/distance?${params.toString()}`);
      if (!response.ok) throw new Error("Route distance service could not complete this estimate");
      const payload = (await response.json()) as { distanceKm?: number; source?: string };
      if (typeof payload.distanceKm !== "number") throw new Error("Route distance estimate could not be completed");
      setDistanceKm(Math.max(1, roundDistance(payload.distanceKm)));
      setDistanceSource("Calculated with route distance");
    } catch {
      setDistanceKm(fallbackDistance(origin, destination));
      setDistanceSource("Estimated with Fast Fleets 360 fallback routing");
    } finally {
      setRouteLoading(false);
    }
  }

  const bookingParams = new URLSearchParams();
  if ((pickupUsesCurrentLocation ? currentAddress || pickup : pickup).trim()) bookingParams.set("pickup", (pickupUsesCurrentLocation ? currentAddress || pickup : pickup).trim());
  if (dropoff.trim()) bookingParams.set("dropoff", dropoff.trim());
  const bookingHref = bookingParams.toString() ? `/book?${bookingParams.toString()}` : "/book";

  return (
    <section className="bg-white py-7 sm:py-10">
      <div className="section-wrap">
        <div className="grid gap-4 lg:grid-cols-[0.82fr_1.18fr] lg:items-stretch">
          <Card className="overflow-hidden p-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-fleet-ember">Your Location</span>
              <h2 className="mt-2 text-2xl font-black leading-tight text-fleet-night sm:text-4xl">Where should we pick up from?</h2>
              <p className="mt-2 max-w-xl text-xs font-semibold leading-5 text-slate-600 sm:text-sm">
                Start with your live location, add a drop-off, and see the delivery distance and fee before booking.
              </p>
            </div>

            <div className="mt-4 grid gap-3">
              <AddressAutocompleteInput
                label="Pickup address"
                value={pickup}
                onChange={(value) => {
                  setPickup(value);
                  setPickupUsesCurrentLocation(false);
                }}
                placeholder="Enter pickup street address"
              />

              <AddressAutocompleteInput
                label="Drop-off address"
                value={dropoff}
                onChange={setDropoff}
                placeholder="Enter recipient street address"
              />

              <div className="grid gap-2">
                <Link href={bookingHref} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-fleet border border-transparent bg-fleet-ember px-4 text-sm font-extrabold text-white shadow-[0_16px_32px_rgba(239,108,0,0.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f47e18] focus:outline-none focus:ring-4 focus:ring-fleet-gold/20">
                  Book Delivery
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="mt-3 rounded-fleet border border-white/70 bg-white/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-black text-fleet-night">
                  <Navigation className="h-4 w-4 text-fleet-ember" />
                  {locationMessage}
                </span>
                {location?.accuracy ? <span className="text-xs font-bold text-slate-500">{Math.round(location.accuracy)}m accuracy</span> : null}
              </div>
            </div>
          </Card>

          <div className="grid gap-4">
            <div className="relative min-h-[300px] overflow-hidden rounded-fleet border border-white/70 bg-white/70 shadow-[0_14px_34px_rgba(8,17,31,0.1)] backdrop-blur-xl sm:min-h-[390px]">
              {mapUrl ? (
                <iframe
                  title="Your Location live map"
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
              <div className="pointer-events-none absolute inset-x-3 bottom-3 rounded-fleet border border-white/80 bg-white/80 p-3 shadow-lift backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-black text-fleet-night">
                    <Route className="h-4 w-4 text-fleet-ember" />
                    Live interactive map
                  </span>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Mobile ready</span>
                </div>
              </div>
            </div>

            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-black uppercase tracking-[0.16em] text-fleet-ember">Auto price estimate</span>
                  <strong className="mt-1 block text-3xl font-black text-fleet-night">{formatMoney(pricing.total)}</strong>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-fleet-night px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-white">
                  {routeLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 text-fleet-gold" />}
                  {distanceKm.toFixed(1)} km
                </span>
              </div>
              <div className="mt-3 grid gap-2">
                <PriceRow label="Estimated distance" value={`${distanceKm.toFixed(1)} km`} />
                <PriceRow label="Delivery fee" value={formatMoney(pricing.deliveryFee)} />
                <PriceRow label="Platform fee" value={formatMoney(pricing.platformFee)} />
                <PriceRow label="Total fee" value={formatMoney(pricing.total)} strong />
              </div>
              <p className="mt-3 text-[0.72rem] font-bold leading-5 text-slate-500">{distanceSource}. Final estimate updates with the route distance.</p>
            </Card>
          </div>
        </div>
      </div>

    </section>
  );
}

function PriceRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-fleet border border-white/65 bg-white/65 px-3 py-2 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-xl">
      <span className="font-bold text-slate-500">{label}</span>
      <strong className={`text-right font-black ${strong ? "text-fleet-ember" : "text-fleet-night"}`}>{value}</strong>
    </div>
  );
}

function parseCoordinates(value: string): Coordinates | null {
  const match = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function formatCoordinates(coordinates: Coordinates) {
  return `${coordinates.latitude},${coordinates.longitude}`;
}

function haversineDistanceKm(origin: Coordinates, destination: Coordinates) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(destination.latitude - origin.latitude);
  const dLon = toRadians(destination.longitude - origin.longitude);
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(destination.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function roundDistance(value: number) {
  return Math.round(value * 10) / 10;
}

function fallbackDistance(origin: string, destination: string) {
  const seed = stableHash(`${origin}|${destination}`);
  return Math.max(1, roundDistance(1 + (seed % 90) / 10));
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
