"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Banknote, Bike, Home, LayoutDashboard, Loader2, MessageCircle, Navigation2, PackageCheck, Phone, ShieldAlert, Star, ToggleLeft, ToggleRight, UserRound, WalletCards, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearServiceWorkerSession } from "@/lib/service-worker-session";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, initials } from "@/lib/format";
import { geolocationErrorMessage, getLocationPermissionState, requestCurrentPosition } from "@/lib/location/geolocation";
import { bicycleCrossStateRouteMaxKm, coordinatePoint, crossStatePickupRadiusKm, isFreshLocation } from "@/lib/location/proximity";
import { extractNigerianState, pickupMatchesRiderState } from "@/lib/location/state-matching";
import { isCustomerPickupProofRequired, pickupProofFromMetadata, pickupProofNeedsUpload, pickupProofReviewExpired, pickupProofReviewSecondsRemaining, pickupProofStatusMessage } from "@/lib/pickup-proof";
import { riderAccountTypeLabel, type RiderAccountType } from "@/lib/rider-account-type";
import { IMAGE_UPLOAD_ACCEPT, compressImage, uploadProfilePhoto, validateClientFile } from "@/lib/storage";
import { AccountDeletionButton } from "@/components/dashboard/account-deletion";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { NotificationBell } from "@/components/dashboard/notification-bell";
import { RoutePreview } from "@/components/maps/route-preview";
import type { LiveRiderLocation } from "@/components/realtime/use-live-delivery-tracking";
import { ReviewPrompt } from "@/components/reviews/review-prompt";
import { TransactionHistory } from "@/components/wallet/transaction-history";
import { WalletDashboardCard } from "@/components/wallet/wallet-dashboard-card";
import { BackButton } from "@/components/ui/back-button";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";

type RiderTab = "home" | "jobs" | "earnings" | "account";
type KycStatus = "approved" | "pending_review" | "rejected" | "submitted" | "under_review" | "more_info_required";

type RiderDashboardProps = {
  initialKycStatus?: KycStatus;
  rejectionReason?: string | null;
};

type RiderProfile = {
  id?: string | null;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  lga?: string | null;
  operating_zone?: string | null;
  address?: string | null;
  vehicle_type?: string | null;
  plate_number?: string | null;
  vehicle_color?: string | null;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  rating?: number | null;
  completed_deliveries?: number | null;
  online?: boolean | null;
  application_status?: KycStatus | null;
  rider_account_type?: RiderAccountType | null;
};

type JobRow = {
  id: string;
  delivery_code: string;
  pickup_address: string;
  pickup_latitude?: number | null;
  pickup_longitude?: number | null;
  pickup_contact?: string | null;
  dropoff_address: string;
  dropoff_contact?: string | null;
  status: string;
  price_ngn: number;
  distance_km?: number | null;
  eta_minutes?: number | null;
  created_at?: string | null;
  proof_url?: string | null;
  rider_id?: string | null;
  vehicle_type?: string | null;
  metadata?: Record<string, unknown> | null;
  users?: {
    full_name?: string | null;
    phone?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

type WithdrawalRow = {
  id: string;
  amount_ngn: number;
  bank_name: string;
  account_number: string;
  status: string;
  created_at: string;
};

const tabs: Array<{ id: RiderTab; label: string; icon: LucideIcon }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "jobs", label: "Jobs", icon: PackageCheck },
  { id: "earnings", label: "Earnings", icon: WalletCards },
  { id: "account", label: "Account", icon: UserRound }
];

const jobFields =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email, avatar_url)";

const riderProfileFields =
  "id, vehicle_type, plate_number, vehicle_color, bank_name, account_number, account_name, rating, completed_deliveries, online, application_status, rider_account_type, operating_zone, address";

export function RiderAccessState({ status, rejectionReason }: { status: KycStatus; rejectionReason?: string | null }) {
  const router = useRouter();
  const rejected = status === "rejected";

  useEffect(() => {
    if (status === "approved") return;
    let mounted = true;

    async function checkRiderStatus() {
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user || !mounted) return;
        const [{ data: profile }, { data: application }] = await Promise.all([
          supabase.from("rider_profiles").select("application_status").eq("user_id", user.id).maybeSingle<{ application_status?: KycStatus | null }>(),
          supabase.from("rider_applications").select("status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle<{ status?: KycStatus | null }>()
        ]);
        if (!mounted) return;
        if (profile?.application_status === "approved" || application?.status === "approved") router.refresh();
      } catch {
        // Keep the pending screen stable if a background status check fails.
      }
    }

    void checkRiderStatus();
    const timer = window.setInterval(checkRiderStatus, 15000);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [router, status]);

  return (
    <section className="section-wrap pb-10 pt-4">
      <BackButton className="mb-4" />
      <Card className="mx-auto max-w-2xl p-6 text-center">
        <span className={cn("mx-auto grid h-16 w-16 place-items-center rounded-full", rejected ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
          <ShieldAlert className="h-8 w-8" />
        </span>
        <StatusBadge tone={rejected ? "red" : "amber"} className="mt-5">{rejected ? "Rejected" : "Pending review"}</StatusBadge>
        <h1 className="mt-3 text-3xl font-black text-fleet-night">{rejected ? "Your rider application needs attention" : "Your application is under review"}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          {rejected ? rejectionReason || "Fast Fleets 360 operations rejected this application. Please review the note and re-apply." : "We review rider applications within 48 hours. You will receive an SMS and email when a decision is made."}
        </p>
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <LinkButton href="/rider/onboarding">{rejected ? "Re-apply" : "Update application"}</LinkButton>
          <LinkButton href="/support" variant="secondary">Contact support</LinkButton>
        </div>
      </Card>
    </section>
  );
}

async function loadRiderJobs(supabase: ReturnType<typeof createClient>, riderId: string | null, vehicleType: string | null | undefined, includeAvailable: boolean, riderZone?: string | null) {
  try {
    const response = await fetch(`/api/rider/jobs?includeAvailable=${includeAvailable ? "1" : "0"}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { jobs?: JobRow[] };
    if (response.ok && Array.isArray(payload.jobs)) return payload.jobs;
  } catch {
    // Fall back to the browser Supabase client below when the API is unavailable in local preview.
  }
  if (!riderId) return [] as JobRow[];
  const riderState = extractNigerianState(riderZone);
  const canLoadAvailable = includeAvailable && vehicleType && riderState;
  const [assignedResult, availableByAddressResult, availableByMetadataResult, availableNearbyResult, riderLocationResult] = await Promise.all([
    supabase.from("deliveries").select(jobFields).eq("rider_id", riderId).order("created_at", { ascending: false }).limit(40),
    canLoadAvailable
      ? supabase
          .from("deliveries")
          .select(jobFields)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", vehicleType)
          .ilike("pickup_address", `%${riderState}%`)
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] }),
    canLoadAvailable
      ? supabase
          .from("deliveries")
          .select(jobFields)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", vehicleType)
          .contains("metadata", { pickup_state: riderState })
          .order("created_at", { ascending: true })
          .limit(20)
      : Promise.resolve({ data: [] }),
    canLoadAvailable
      ? supabase
          .from("deliveries")
          .select(jobFields)
          .eq("status", "searching")
          .is("rider_id", null)
          .eq("vehicle_type", vehicleType)
          .order("created_at", { ascending: true })
          .limit(80)
      : Promise.resolve({ data: [] }),
    canLoadAvailable
      ? supabase
          .from("rider_locations")
          .select("latitude, longitude, updated_at")
          .eq("rider_profile_id", riderId)
          .maybeSingle<{ latitude?: number | string | null; longitude?: number | string | null; updated_at?: string | null }>()
      : Promise.resolve({ data: null })
  ]);
  const assigned = ((assignedResult.data || []) as JobRow[]).filter(Boolean);
  const riderLocation = (riderLocationResult.data || null) as { latitude?: number | string | null; longitude?: number | string | null; updated_at?: string | null } | null;
  const available = [
    ...((availableByAddressResult.data || []) as JobRow[]),
    ...((availableByMetadataResult.data || []) as JobRow[]),
    ...((availableNearbyResult.data || []) as JobRow[])
  ].filter((job) => !isRejectedByRider(job, riderId) && (pickupMatchesRiderState(job.pickup_address, riderZone, job.metadata) || jobMatchesCrossStateFallback(job, riderLocation)));
  return mergeJobs([...available, ...assigned]);
}

function normalizeDispatchVehicle(vehicleType: string | null | undefined) {
  if (vehicleType === "car" || vehicleType === "van" || vehicleType === "bike") return vehicleType;
  if (vehicleType === "motorcycle" || vehicleType === "tricycle") return "bike";
  return null;
}

async function ensureClientRiderProfile(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  options: { online?: boolean; vehicleType?: string | null } = {}
) {
  const { data: existing, error: existingError } = await supabase
    .from("rider_profiles")
    .select(riderProfileFields)
    .eq("user_id", userId)
    .maybeSingle<RiderProfile>();
  if (existingError) throw existingError;
  if (!existing?.id) return null;

  const dispatchVehicle = normalizeDispatchVehicle(options.vehicleType || existing?.vehicle_type) || "bike";
  const patch: Partial<Pick<RiderProfile, "vehicle_type" | "online">> = {};
  if (existing.application_status === "approved" && existing.vehicle_type !== dispatchVehicle) patch.vehicle_type = dispatchVehicle as RiderProfile["vehicle_type"];
  if (existing.application_status === "approved" && typeof options.online === "boolean" && existing.online !== options.online) patch.online = options.online;

  if (!Object.keys(patch).length) return { ...existing, vehicle_type: dispatchVehicle };

  const { data, error } = await supabase
    .from("rider_profiles")
    .update(patch)
    .eq("id", existing.id)
    .select(riderProfileFields)
    .maybeSingle<RiderProfile>();
  if (error) throw error;
  return data || { ...existing, ...patch };
}

async function fetchRiderAvailability(vehicleType?: string | null) {
  const params = new URLSearchParams();
  if (vehicleType) params.set("vehicleType", vehicleType);
  const response = await fetch(`/api/rider/availability${params.size ? `?${params.toString()}` : ""}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as { profile?: RiderProfile | null; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not load rider availability.");
  return payload.profile || null;
}

async function saveRiderAvailability(options: { online?: boolean; vehicleType?: string | null }) {
  const response = await fetch("/api/rider/availability", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options)
  });
  const payload = (await response.json().catch(() => ({}))) as { profile?: RiderProfile | null; error?: string };
  if (!response.ok) throw new Error(payload.error || "Could not update rider availability.");
  return payload.profile || null;
}

async function uploadPickupProof(deliveryId: string, file: File) {
  validateClientFile(file);
  const body = new FormData();
  body.set("deliveryId", deliveryId);
  body.set("file", await compressImage(file, 1280, 0.78));

  const response = await fetch("/api/rider/pickup-proof", {
    method: "POST",
    body
  });
  const payload = (await response.json().catch(() => ({}))) as { job?: JobRow; error?: string };
  if (!response.ok || !payload.job) throw new Error(payload.error || "Could not upload package photo.");
  return payload.job;
}

function mergeJobs(jobs: JobRow[]) {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.id)) return false;
    seen.add(job.id);
    return true;
  });
}

function isRejectedByRider(job: JobRow, riderId: string | null | undefined) {
  const rejectedIds = job.metadata?.rejected_rider_ids;
  return Boolean(riderId && Array.isArray(rejectedIds) && rejectedIds.includes(riderId));
}

function formatCoordinates(location: LiveRiderLocation) {
  return `${location.latitude},${location.longitude}`;
}

function pickupDestination(job: JobRow) {
  if (job.pickup_latitude != null && job.pickup_longitude != null) return `${job.pickup_latitude},${job.pickup_longitude}`;
  return job.pickup_address;
}

function fallbackPickupEta(job: JobRow, liveLocation: LiveRiderLocation | null) {
  if (liveLocation && job.pickup_latitude != null && job.pickup_longitude != null) {
    const distanceKm = haversineKm(liveLocation, { latitude: Number(job.pickup_latitude), longitude: Number(job.pickup_longitude) });
    return Math.max(4, Math.round((distanceKm / 24) * 60 + 5));
  }
  const routeEta = Number(job.eta_minutes || 0);
  if (routeEta > 0) return Math.max(5, Math.round(routeEta * 0.45));
  const distanceKm = Number(job.distance_km || 0);
  if (distanceKm > 0) return Math.max(5, Math.round((distanceKm / 24) * 60));
  return null;
}

function pickupEtaLabel(minutes: number | null, loading: boolean, liveLocation: LiveRiderLocation | null) {
  if (minutes) return `ETA to pickup: ${minutes} min`;
  if (loading) return "ETA to pickup: calculating...";
  if (!liveLocation) return "ETA to pickup: waiting for driver location";
  return "ETA to pickup: unavailable";
}

function jobMatchesCrossStateFallback(
  job: JobRow,
  riderLocation: { latitude?: number | string | null; longitude?: number | string | null; updated_at?: string | null } | null
) {
  if (!isFreshLocation(riderLocation?.updated_at)) return false;
  const riderPoint = coordinatePoint(riderLocation?.latitude, riderLocation?.longitude);
  const pickupPoint = coordinatePoint(job.pickup_latitude, job.pickup_longitude)
    || coordinatePoint(job.metadata?.pickup_latitude, job.metadata?.pickup_longitude)
    || coordinatePoint(job.metadata?.pickupLatitude, job.metadata?.pickupLongitude);
  if (!riderPoint || !pickupPoint) return false;
  if (haversineKm(riderPoint, pickupPoint) > crossStatePickupRadiusKm) return false;
  if (!isBicycleJob(job.metadata)) return true;
  const routeKm = Number(job.distance_km || job.metadata?.delivery_distance_km || job.metadata?.distance_km || 0);
  return Number.isFinite(routeKm) && routeKm > 0 && routeKm <= bicycleCrossStateRouteMaxKm;
}

function isBicycleJob(metadata: Record<string, unknown> | null | undefined) {
  const subtype = String(metadata?.vehicle_subtype || metadata?.vehicleSubtype || "").toLowerCase();
  return subtype === "bicycle";
}

function parseDurationMinutes(value: string | null | undefined) {
  if (!value) return null;
  const hourMatch = value.match(/(\d+(?:\.\d+)?)\s*hour/i);
  const minuteMatch = value.match(/(\d+(?:\.\d+)?)\s*min/i);
  const hours = hourMatch ? Number(hourMatch[1]) : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  const total = Math.round(hours * 60 + minutes);
  return total > 0 ? total : null;
}

function haversineKm(from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) {
  const earthKm = 6371;
  const dLat = degreesToRadians(to.latitude - from.latitude);
  const dLng = degreesToRadians(to.longitude - from.longitude);
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function RiderDashboard({ initialKycStatus = "approved", rejectionReason }: RiderDashboardProps) {
  const [activeTab, setActiveTab] = useState<RiderTab>("home");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(false);
  const [onlineSince, setOnlineSince] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState("0m");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [profile, setProfile] = useState<RiderProfile>({});
  const [walletBalance, setWalletBalance] = useState(0);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [incomingExpires, setIncomingExpires] = useState(30);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState("");
  const [withdrawalMessage, setWithdrawalMessage] = useState<string | null>(null);
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [prefs, setPrefs] = useState({ jobs: true, payouts: true, sms: true });
  const [liveLocation, setLiveLocation] = useState<LiveRiderLocation | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [trackingMessage, setTrackingMessage] = useState<string | null>(null);
  const [deliveryPin, setDeliveryPin] = useState("");
  const [deliveryPinLoading, setDeliveryPinLoading] = useState(false);
  const [offerNotice, setOfferNotice] = useState<string | null>(null);
  const [pickupEtaMinutes, setPickupEtaMinutes] = useState<number | null>(null);
  const [pickupEtaLoading, setPickupEtaLoading] = useState(false);
  const [activeJobSheetOpen, setActiveJobSheetOpen] = useState(false);
  const desiredOnlineRef = useRef<boolean | null>(null);
  const onlineMutationRef = useRef(false);

  const incomingJob = jobs.find((job) => job.status === "searching") || null;
  const activeJob = jobs.find((job) => ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"].includes(job.status)) || null;
  const latestCompletedTrip = jobs.find((job) => job.status === "delivered") || null;
  const recentTrips = jobs.filter((job) => job.status === "delivered").slice(0, 5);
  const firstName = (profile.full_name || "Rider").split(/\s+/)[0] || "Rider";
  const todayEarnings = jobs.filter((job) => job.status === "delivered").reduce((sum, job) => sum + Number(job.price_ngn || 0), 0);
  const reviewSubject = useMemo(() => {
    const trip = latestCompletedTrip;
    if (!trip?.id) return null;
    return {
      reviewerRole: "rider" as const,
      subjectType: "rider_delivery" as const,
      deliveryId: trip.id,
      title: "How was this delivery?",
      body: "Rate the handoff so dispatch can spot issues early.",
      metadata: {
        delivery_code: trip.delivery_code,
        pickup_address: trip.pickup_address,
        dropoff_address: trip.dropoff_address
      }
    };
  }, [latestCompletedTrip]);

  useEffect(() => {
    if (activeJob) {
      setActiveJobSheetOpen(true);
    } else {
      setActiveJobSheetOpen(false);
    }
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    setDeliveryPin("");
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    if (!onlineSince) return;
    const timer = window.setInterval(() => {
      const minutes = Math.floor((Date.now() - onlineSince.getTime()) / 60000);
      const hours = Math.floor(minutes / 60);
      setElapsed(hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [onlineSince]);

  useEffect(() => {
    if (!incomingJob) return;
    setIncomingExpires(30);
    const timer = window.setInterval(() => {
      setIncomingExpires((value) => {
        if (value <= 1) {
          setJobs((current) => current.filter((job) => job.id !== incomingJob.id));
          return 30;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [incomingJob?.id]);

  useEffect(() => {
    if (!trackingActive || !online || !profile.id || !activeJob) return;
    if (["delivered", "cancelled"].includes(activeJob.status)) {
      setTrackingActive(false);
      setTrackingMessage("Delivery tracking stopped.");
      return;
    }

    const supabase = createClient();
    const riderProfileId = profile.id;
    const trackingJob = activeJob;
    let stopped = false;

    async function publishLocation() {
      try {
        const position = await requestCurrentPosition();
        if (stopped) return;
        const nextLocation: LiveRiderLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          updated_at: new Date().toISOString()
        };
        setLiveLocation(nextLocation);
        setTrackingMessage("Live delivery tracking is on.");
        void Promise.allSettled([
          supabase.from("rider_locations").upsert(
            {
              rider_profile_id: riderProfileId,
              zone: profile.lga || "Lagos",
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              heading: nextLocation.heading,
              speed: nextLocation.speed,
              updated_at: nextLocation.updated_at
            },
            { onConflict: "rider_profile_id" }
          ),
          supabase.from("delivery_locations").upsert(
            {
              order_id: trackingJob.id,
              rider_id: riderProfileId,
              latitude: nextLocation.latitude,
              longitude: nextLocation.longitude,
              heading: nextLocation.heading,
              speed: nextLocation.speed,
              status: trackingJob.status,
              updated_at: nextLocation.updated_at
            },
            { onConflict: "order_id" }
          )
        ]);
      } catch (error) {
        if (!stopped) setTrackingMessage(geolocationErrorMessage(error));
      }
    }

    publishLocation();
    const timer = window.setInterval(publishLocation, 7000);

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [activeJob?.id, activeJob?.status, online, profile.id, profile.lga, trackingActive]);

  useEffect(() => {
    if (!online || !profile.id) return;
    const supabase = createClient();
    const riderProfileId = profile.id;
    let stopped = false;

    async function publishOnlineLocation() {
      try {
        const position = await requestCurrentPosition();
        if (stopped) return;
        const nextLocation: LiveRiderLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          heading: position.coords.heading,
          speed: position.coords.speed,
          updated_at: new Date().toISOString()
        };
        setLiveLocation(nextLocation);
        await supabase.from("rider_locations").upsert(
          {
            rider_profile_id: riderProfileId,
            zone: profile.lga || "Lagos",
            latitude: nextLocation.latitude,
            longitude: nextLocation.longitude,
            heading: nextLocation.heading,
            speed: nextLocation.speed,
            updated_at: nextLocation.updated_at
          },
          { onConflict: "rider_profile_id" }
        );
      } catch (error) {
        if (!stopped && incomingJob) setOfferNotice(geolocationErrorMessage(error));
      }
    }

    void publishOnlineLocation();
    const timer = window.setInterval(publishOnlineLocation, incomingJob ? 12000 : 30000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [incomingJob?.id, online, profile.id, profile.lga]);

  useEffect(() => {
    if (!incomingJob) {
      setPickupEtaMinutes(null);
      setPickupEtaLoading(false);
      return;
    }

    const fallback = fallbackPickupEta(incomingJob, liveLocation);
    setPickupEtaMinutes(fallback);

    if (!liveLocation) return;
    let cancelled = false;
    setPickupEtaLoading(true);
    const origin = formatCoordinates(liveLocation);
    const destination = pickupDestination(incomingJob);

    fetch(`/api/maps/distance?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { durationText?: string | null }) => {
        if (cancelled) return;
        const minutes = parseDurationMinutes(payload.durationText);
        if (minutes) setPickupEtaMinutes(minutes);
      })
      .catch(() => {
        if (!cancelled) setPickupEtaMinutes(fallback);
      })
      .finally(() => {
        if (!cancelled) setPickupEtaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [incomingJob, liveLocation]);

  useEffect(() => {
    if (trackingActive && !activeJob) {
      setTrackingActive(false);
      setTrackingMessage("Delivery tracking stopped.");
    }
  }, [activeJob, trackingActive]);

  async function startDeliveryTracking() {
    if (!activeJob) {
      setTrackingMessage("Accept an active delivery before starting tracking.");
      return;
    }
    if (!online) {
      setTrackingMessage("Go online before starting delivery tracking.");
      return;
    }
    const permission = await getLocationPermissionState();
    setTrackingMessage(permission === "denied" ? "Location permission is blocked. Enable it in your browser or phone settings." : "Requesting location permission...");
    setTrackingActive(true);
  }

  function stopDeliveryTracking() {
    setTrackingActive(false);
    setTrackingMessage("Delivery tracking paused.");
  }

	  useEffect(() => {
	    let mounted = true;
    async function load(silent = false) {
      if (!silent) setLoading(true);
      try {
        const supabase = createClient();
        const {
          data: { user }
        } = await supabase.auth.getUser();
        if (!user) return;

        const [profileResult, appUserResult, latestApplicationResult, riderResult, walletResult, withdrawalsResult] = await Promise.all([
          supabase.from("profiles").select("full_name, email, phone, avatar_url, lga").eq("user_id", user.id).maybeSingle(),
          supabase.from("users").select("full_name, email, phone, avatar_url, default_zone").eq("id", user.id).maybeSingle(),
          supabase.from("rider_applications").select("full_name, phone, email, lga").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
          fetchRiderAvailability().then((data) => ({ data })).catch(() => supabase.from("rider_profiles").select(riderProfileFields).eq("user_id", user.id).maybeSingle()),
          supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).eq("wallet_type", "rider").maybeSingle(),
          fetch("/api/wallet/withdrawals?accountKind=rider", { cache: "no-store" }).then((response) => response.json()).catch(() => ({ withdrawals: [] }))
        ]);
	        let riderData = (riderResult.data as RiderProfile | null) || {};
        const profileData = (profileResult.data || {}) as RiderProfile;
        const appUserData = (appUserResult.data || {}) as RiderProfile & { default_zone?: string | null };
        const applicationData = (latestApplicationResult.data || {}) as RiderProfile;
	        let riderId = riderData.id || null;
	        const approved = riderData.application_status === "approved" || initialKycStatus === "approved";
	        if (!riderId && approved) {
	          riderData = (await ensureClientRiderProfile(supabase, user.id, { vehicleType: riderData.vehicle_type })) || riderData;
	          riderId = riderData.id || null;
	        }
	        let dispatchVehicle = normalizeDispatchVehicle(riderData.vehicle_type) || "bike";
	        let effectiveOnline = Boolean(riderData.online);
	        if (silent && approved && desiredOnlineRef.current === true && !effectiveOnline) {
	          const restored = (await saveRiderAvailability({ online: true, vehicleType: riderData.vehicle_type }).catch(() => ensureClientRiderProfile(supabase, user.id, { online: true, vehicleType: riderData.vehicle_type })));
	          if (restored?.id) {
	            riderData = restored;
	            riderId = restored.id;
	            effectiveOnline = Boolean(restored.online);
	          }
	        }
	        if (riderId && approved && (riderData.vehicle_type !== dispatchVehicle || riderData.application_status !== "approved")) {
	          riderData = (await saveRiderAvailability({ vehicleType: dispatchVehicle }).catch(() => ensureClientRiderProfile(supabase, user.id, { vehicleType: dispatchVehicle }))) || riderData;
	          riderId = riderData.id || null;
	          dispatchVehicle = normalizeDispatchVehicle(riderData.vehicle_type) || dispatchVehicle;
	        }
        const riderZone = riderData.operating_zone || riderData.address || riderData.lga || applicationData.lga || appUserData.default_zone || profileData.lga || null;
	        const jobsResult = await (
	          riderId || approved
	            ? loadRiderJobs(supabase, riderId, dispatchVehicle, effectiveOnline, riderZone)
	            : Promise.resolve({ data: [] })
	        );
        if (!mounted) return;
        const nextProfile = {
          ...profileData,
          ...riderData,
          full_name: profileData.full_name || appUserData.full_name || applicationData.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null,
          phone: profileData.phone || appUserData.phone || applicationData.phone || user.phone || null,
          email: profileData.email || appUserData.email || applicationData.email || user.email || null,
          avatar_url: profileData.avatar_url || appUserData.avatar_url || null,
          lga: profileData.lga || riderZone || "Lagos",
          operating_zone: riderData.operating_zone || riderZone,
          address: riderData.address || null,
          application_status: approved ? "approved" : riderData.application_status,
          vehicle_type: dispatchVehicle,
          online: onlineMutationRef.current && desiredOnlineRef.current !== null ? desiredOnlineRef.current : effectiveOnline
        };
        setProfile(nextProfile);
        const nextOnline = Boolean(nextProfile.online);
        desiredOnlineRef.current = nextOnline;
        setOnline(nextOnline);
        setOnlineSince((current) => (nextOnline ? current || new Date() : null));
        setWalletBalance(Number((walletResult.data as { balance_ngn?: number } | null)?.balance_ngn || 0));
	        setJobs(Array.isArray(jobsResult) ? jobsResult : ((jobsResult.data || []) as JobRow[]));
        setWithdrawals(Array.isArray(withdrawalsResult.withdrawals) ? withdrawalsResult.withdrawals : []);
      } catch {
        if (mounted && !silent) setJobs([]);
      } finally {
        if (mounted && !silent) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      void load(true);
    }, 60000);
	    return () => {
	      mounted = false;
	      window.clearInterval(timer);
	    };
	  }, []);

	  useEffect(() => {
	    if (!online || !profile.id) return;
	    const supabase = createClient();
	    let mounted = true;
	    const dispatchVehicle = normalizeDispatchVehicle(profile.vehicle_type) || "bike";

	    async function refreshAvailableJobs() {
	      const nextJobs = await loadRiderJobs(supabase, profile.id || null, dispatchVehicle, true, profile.operating_zone || profile.address || profile.lga);
	      if (!mounted) return;
	      setJobs((current) => {
	        const nextIds = new Set(nextJobs.map((job) => job.id));
	        const removedIncoming = current.find((job) => job.status === "searching" && !nextIds.has(job.id) && !isRejectedByRider(job, profile.id));
	        if (removedIncoming) setOfferNotice(`${removedIncoming.delivery_code} has been accepted by another rider.`);
	        return nextJobs;
	      });
	    }

	    const channel = supabase
	      .channel(`rider-available-jobs:${profile.id}`)
	      .on("postgres_changes", { event: "*", schema: "public", table: "deliveries" }, (payload) => {
	        const next = payload.new as Partial<JobRow> & { rider_id?: string | null; vehicle_type?: string | null };
	        if (next?.vehicle_type === dispatchVehicle || next?.rider_id === profile.id) void refreshAvailableJobs();
	      })
	      .subscribe();
	    void refreshAvailableJobs();
	    const timer = window.setInterval(refreshAvailableJobs, 15000);

	    return () => {
	      mounted = false;
	      window.clearInterval(timer);
	      supabase.removeChannel(channel);
	    };
	  }, [online, profile.id, profile.vehicle_type]);
	
	  async function toggleOnline() {
    if (profile.application_status !== "approved" && initialKycStatus !== "approved") {
      setOnline(false);
      setOnlineSince(null);
      return;
    }
    const nextOnline = !online;
    if (!nextOnline && activeJob) {
      window.alert("You can't go offline until the dispatch job has been delivered.");
      return;
    }
    desiredOnlineRef.current = nextOnline;
    onlineMutationRef.current = true;
    setOnline(nextOnline);
    setOnlineSince(nextOnline ? new Date() : null);
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to update rider availability.");
      const dispatchVehicle = normalizeDispatchVehicle(profile.vehicle_type) || "bike";
      const updatedProfile = await saveRiderAvailability({ online: nextOnline, vehicleType: dispatchVehicle }).catch(() => ensureClientRiderProfile(supabase, user.id, { online: nextOnline, vehicleType: dispatchVehicle }));
      if (!updatedProfile?.id) throw new Error("Your approved rider profile was not found. Please contact support.");
      desiredOnlineRef.current = nextOnline;
      setProfile((current) => ({ ...current, ...updatedProfile, vehicle_type: dispatchVehicle, online: nextOnline }));
      if (nextOnline) {
        const nextJobs = await loadRiderJobs(supabase, updatedProfile.id, dispatchVehicle, true, updatedProfile.operating_zone || updatedProfile.address || profile.operating_zone || profile.address || profile.lga);
        setJobs(nextJobs);
        setOfferNotice(nextJobs.some((job) => job.status === "searching") ? "New dispatch orders are available." : null);
      } else {
        setJobs((current) => current.filter((job) => job.status !== "searching"));
        setOfferNotice(null);
      }
    } catch (error) {
      desiredOnlineRef.current = !nextOnline;
      setOnline(!nextOnline);
      setOnlineSince(!nextOnline ? new Date() : null);
      setProfile((current) => ({ ...current, online: !nextOnline }));
      setOfferNotice(error instanceof Error ? error.message : "Could not update rider availability.");
    } finally {
      onlineMutationRef.current = false;
    }
  }

	  async function respondToJob(job: JobRow, accepted: boolean) {
	    try {
	      setOfferNotice(null);
	      const response = await fetch("/api/rider/jobs", {
	        method: "POST",
	        headers: { "Content-Type": "application/json" },
	        body: JSON.stringify({ id: job.id, action: accepted ? "accept" : "decline" })
	      });
	      const payload = await response.json();
	      if (!response.ok) throw new Error(payload.error || "Could not update job.");
	      setJobs((current) => accepted ? [payload.job as JobRow, ...current.filter((item) => item.id !== job.id && item.status !== "searching")] : current.filter((item) => item.id !== job.id));
	      if (accepted) {
	        setTrackingMessage("Job accepted. Requesting location permission for live delivery tracking...");
	        setTrackingActive(true);
	      }
	    } catch (error) {
	      const message = error instanceof Error ? error.message : "Could not update job.";
	      setOfferNotice(message.includes("accepted by another rider") ? `${job.delivery_code} has been accepted by another rider.` : message);
	      setJobs((current) => current.filter((item) => item.id !== job.id || !message.includes("accepted by another rider")));
	    }
	  }

  async function advanceJob(job: JobRow) {
    try {
      if (job.status === "picked_up" && isCustomerPickupProofRequired(job.metadata)) {
        const proof = pickupProofFromMetadata(job.metadata);
        if (pickupProofNeedsUpload(job.metadata)) {
          if (!proofFile) {
            setTrackingMessage("Upload the package photo before starting the trip.");
            return;
          }
          const uploadedJob = await uploadPickupProof(job.id, proofFile);
          setJobs((current) => current.map((item) => item.id === job.id ? uploadedJob : item));
          setProofFile(null);
          setTrackingMessage("Package photo sent to the customer for confirmation.");
          return;
        }
        if (proof?.status === "pending" && !pickupProofReviewExpired(proof)) {
          setTrackingMessage("Waiting for customer package confirmation. You can start the trip after approval or when the review window ends.");
          return;
        }
      }
      const response = await fetch("/api/rider/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, action: "advance" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not advance delivery.");
      setJobs((current) => current.map((item) => item.id === job.id ? (payload.job as JobRow) : item));
      if ((payload.job as JobRow)?.status === "delivered" || (payload.job as JobRow)?.status === "cancelled") {
        setTrackingActive(false);
        setTrackingMessage((payload.job as JobRow)?.status === "delivered"
          ? "Delivery confirmed successfully."
          : "Delivery tracking stopped.");
      } else if ((payload.job as JobRow)?.status === "awaiting_delivery_confirmation") {
        setTrackingActive(false);
        setTrackingMessage("Arrival recorded. Ask the recipient for the six-digit delivery PIN or wait for them to confirm in the messenger.");
      } else {
        setTrackingMessage(`Delivery status updated to ${(payload.job as JobRow).status.replaceAll("_", " ")}.`);
      }
      setProofFile(null);
    } catch (error) {
      setTrackingMessage(error instanceof Error ? error.message : "Could not update delivery status.");
    }
  }

  async function verifyDeliveryPin(job: JobRow) {
    const code = deliveryPin.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setTrackingMessage("Enter the six-digit delivery PIN from the recipient.");
      return;
    }
    setDeliveryPinLoading(true);
    try {
      const response = await fetch("/api/rider/delivery-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId: job.id, code })
      });
      const payload = (await response.json().catch(() => ({}))) as {
        job?: JobRow;
        error?: string;
        attemptsRemaining?: number;
        settlement?: { credited?: boolean; amount?: number; error?: string };
      };
      if (!response.ok || !payload.job) throw new Error(payload.error || "Could not verify the delivery PIN.");
      setJobs((current) => current.map((item) => item.id === job.id ? payload.job as JobRow : item));
      setTrackingActive(false);
      setDeliveryPin("");
      if (payload.settlement?.credited && payload.settlement.amount) {
        setWalletBalance((current) => current + Number(payload.settlement?.amount || 0));
        setTrackingMessage(`Delivery confirmed. ${formatMoney(Number(payload.settlement.amount))} was credited to your rider wallet.`);
      } else {
        setTrackingMessage(payload.settlement?.error || "Delivery confirmed successfully.");
      }
    } catch (error) {
      setTrackingMessage(error instanceof Error ? error.message : "Could not verify the delivery PIN.");
    } finally {
      setDeliveryPinLoading(false);
    }
  }

  async function requestWithdrawal() {
    const amount = Number(withdrawalAmount);
    setWithdrawalMessage(null);
    if (!amount || amount < 2000) {
      setWithdrawalMessage("Enter an amount of at least NGN 2,000.");
      return;
    }
    if (amount > 200000) {
      setWithdrawalMessage("Maximum withdrawal is NGN 200,000 per request.");
      return;
    }
    setWithdrawalLoading(true);
    try {
      const response = await fetch("/api/wallet/withdrawals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, accountKind: "rider" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not request withdrawal.");
      setWithdrawals((current) => [payload.withdrawal as WithdrawalRow, ...current]);
      setWalletBalance((current) => Math.max(0, current - amount));
      setWithdrawalMessage("Withdrawal request submitted for payout review.");
      setWithdrawalOpen(false);
      setWithdrawalAmount("");
    } catch (error) {
      setWithdrawalMessage(error instanceof Error ? error.message : "Could not request withdrawal.");
    } finally {
      setWithdrawalLoading(false);
    }
  }

  if (initialKycStatus !== "approved") return <RiderAccessState status={initialKycStatus} rejectionReason={rejectionReason} />;

  return (
    <section className="min-h-screen bg-fleet-paper pb-24 lg:pb-0">
      <div className="mx-auto grid max-w-7xl lg:grid-cols-[260px_1fr]">
        <DesktopNav activeTab={activeTab} onChange={setActiveTab} />
        <main className="min-w-0 px-4 pb-5 pt-4 sm:px-6 lg:pb-8">
          <BackButton className="mb-4" />
          <header className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-fleet-night sm:text-4xl">Ride workspace, {firstName}</h1>
              <p className="mt-1 text-sm font-semibold text-slate-600">Jobs, earnings, and account controls in one mobile-first dashboard.</p>
            </div>
            <NotificationBell />
          </header>
          {activeTab === "home" ? (
            <HomeTab
              loading={loading}
              online={online}
              elapsed={elapsed}
              onToggleOnline={toggleOnline}
              walletBalance={walletBalance}
              profile={profile}
              incomingJob={incomingJob}
              incomingExpires={incomingExpires}
              pickupEtaMinutes={pickupEtaMinutes}
              pickupEtaLoading={pickupEtaLoading}
              activeJob={activeJob}
              recentTrips={recentTrips}
              liveLocation={liveLocation}
              trackingActive={trackingActive}
              trackingMessage={trackingMessage}
              offerNotice={offerNotice}
              onOpenWithdrawal={() => setWithdrawalOpen(true)}
              onOpenActiveJob={() => setActiveJobSheetOpen(true)}
              onRespond={respondToJob}
            />
          ) : null}
          {activeTab === "jobs" ? <JobsTab loading={loading} jobs={jobs} online={online} onToggleOnline={toggleOnline} /> : null}
          {activeTab === "earnings" ? <EarningsTab todayEarnings={todayEarnings} withdrawals={withdrawals} /> : null}
          {activeTab === "account" ? <AccountTab profile={profile} onProfile={setProfile} kycStatus={profile.application_status || initialKycStatus} prefs={prefs} onPrefs={setPrefs} /> : null}
        </main>
      </div>
	      <MobileTabs activeTab={activeTab} onChange={setActiveTab} />
	      {activeJob && activeJobSheetOpen ? (
	        <ActiveJobBottomSheet
	          job={activeJob}
	          proofFile={proofFile}
	          liveLocation={liveLocation}
	          trackingActive={trackingActive}
	          trackingMessage={trackingMessage}
	          deliveryPin={deliveryPin}
	          deliveryPinLoading={deliveryPinLoading}
	          onStartTracking={startDeliveryTracking}
	          onStopTracking={stopDeliveryTracking}
	          onProofFile={setProofFile}
	          onAdvance={advanceJob}
	          onDeliveryPin={setDeliveryPin}
	          onVerifyDeliveryPin={verifyDeliveryPin}
	          onClose={() => setActiveJobSheetOpen(false)}
	        />
	      ) : null}
	      {online && incomingJob ? <IncomingJobModal job={incomingJob} expires={incomingExpires} pickupEtaMinutes={pickupEtaMinutes} pickupEtaLoading={pickupEtaLoading} liveLocation={liveLocation} onRespond={respondToJob} /> : null}
	      {withdrawalOpen ? <WithdrawalModal amount={withdrawalAmount} onAmount={setWithdrawalAmount} profile={profile} loading={withdrawalLoading} message={withdrawalMessage} onClose={() => setWithdrawalOpen(false)} onSubmit={requestWithdrawal} /> : null}
        <ReviewPrompt subject={reviewSubject} />
    </section>
  );
}

function DesktopNav({ activeTab, onChange }: { activeTab: RiderTab; onChange: (tab: RiderTab) => void }) {
  return (
    <aside className="sticky top-0 hidden h-screen border-r border-fleet-line bg-white p-4 lg:block">
      <div className="rounded-fleet bg-fleet-navy p-4 text-white">
        <span className="text-xl font-black">Fast Fleets 360</span>
        <p className="mt-1 text-xs font-semibold text-white/70">Rider app</p>
      </div>
      <nav className="mt-5 grid gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("flex items-center gap-3 rounded-fleet px-3 py-3 text-sm font-black", activeTab === tab.id ? "bg-fleet-navy text-white" : "text-slate-600 hover:bg-fleet-paper")}><Icon className="h-4 w-4" />{tab.label}</button>;
        })}
      </nav>
    </aside>
  );
}

function MobileTabs({ activeTab, onChange }: { activeTab: RiderTab; onChange: (tab: RiderTab) => void }) {
  return (
    <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-5 rounded-fleet border border-fleet-line bg-white p-1 shadow-glow lg:hidden">
      <Link href="/hub" className="grid min-h-14 place-items-center rounded-fleet text-[0.7rem] font-black text-slate-500">
        <LayoutDashboard className="h-4 w-4" />
        Hub
      </Link>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return <button key={tab.id} type="button" onClick={() => onChange(tab.id)} className={cn("grid min-h-14 place-items-center rounded-fleet text-[0.7rem] font-black", activeTab === tab.id ? "bg-[#eaf3ff] text-[#1677df]" : "text-slate-500")}><Icon className="h-4 w-4" />{tab.label}</button>;
      })}
    </nav>
  );
}

function HomeTab({ loading, online, elapsed, onToggleOnline, walletBalance, profile, incomingJob, incomingExpires, pickupEtaMinutes, pickupEtaLoading, activeJob, recentTrips, liveLocation, trackingActive, trackingMessage, offerNotice, onOpenWithdrawal, onOpenActiveJob, onRespond }: { loading: boolean; online: boolean; elapsed: string; onToggleOnline: () => void; walletBalance: number; profile: RiderProfile; incomingJob: JobRow | null; incomingExpires: number; pickupEtaMinutes: number | null; pickupEtaLoading: boolean; activeJob: JobRow | null; recentTrips: JobRow[]; liveLocation: LiveRiderLocation | null; trackingActive: boolean; trackingMessage: string | null; offerNotice: string | null; onOpenWithdrawal: () => void; onOpenActiveJob: () => void; onRespond: (job: JobRow, accepted: boolean) => void }) {
  if (loading) return <DashboardSkeleton />;
  return (
    <div className="grid gap-5">
      <WalletDashboardCard
        userName={profile.full_name?.trim().split(/\s+/)[0] || "Rider"}
        balance={walletBalance}
        walletType="rider"
        accountKind="rider"
        kycStatus={(profile.application_status || "approved") === "approved" ? "verified" : "pending"}
        returnTo="/rider/dashboard"
        onWithdraw={onOpenWithdrawal}
        transactionHref="/rider/dashboard#transactions"
      />
      <TransactionHistory accountKind="rider" />
      <Card className="p-5">
        <button type="button" onClick={onToggleOnline} className={cn("flex w-full items-center justify-between rounded-fleet p-5 text-left transition", online ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")}>
          <span><strong className="block text-2xl font-black">{online ? "Go offline" : "Go online"}</strong><span className="text-sm font-bold">{online ? `Online for ${elapsed}` : "Paused from dispatch"}</span></span>
          {online ? <ToggleRight className="h-12 w-12" /> : <ToggleLeft className="h-12 w-12" />}
        </button>
        <RiderAccountTypeCard accountType={profile.rider_account_type} />
      </Card>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Trips" value={String(profile.completed_deliveries || recentTrips.length)} />
        <Stat label="Rating" value={(profile.rating || 4.9).toFixed(1)} />
      </div>
      {offerNotice ? <div className="rounded-fleet border border-amber-200 bg-amber-50 p-3 text-sm font-black text-amber-800">{offerNotice}</div> : null}
      {incomingJob ? <IncomingJob job={incomingJob} expires={incomingExpires} pickupEtaMinutes={pickupEtaMinutes} pickupEtaLoading={pickupEtaLoading} liveLocation={liveLocation} onRespond={onRespond} /> : <DashboardEmptyState title="No incoming job" body="Go online and new dispatch offers will appear here." ctaLabel="Open jobs" ctaHref="/rider/dashboard" icon={<Bike className="h-7 w-7" />} />}
      {activeJob ? <ActiveJobLauncher job={activeJob} trackingActive={trackingActive} trackingMessage={trackingMessage} onOpen={onOpenActiveJob} /> : null}
      {!activeJob ? <Card className="overflow-hidden p-0">
        <RoutePreview
          compact
          className="rounded-none border-0"
          label="Rider live map"
          status="searching"
          riderName={profile.full_name || "Fast Fleets 360 rider"}
          pickupAddress="Victoria Island, Lagos"
          dropoffAddress="Ikeja GRA, Lagos"
          riderLocation={liveLocation}
          riderAvatarUrl={profile.avatar_url}
          customerName="Customer"
        />
      </Card> : null}
      <section>
        <h2 className="mb-3 text-xl font-black text-fleet-night">Recent trips</h2>
        <div className="grid gap-3">
          {recentTrips.length ? recentTrips.map((job) => <TripCard key={job.id} job={job} />) : (
            <Card className="p-5 text-center">
              <h3 className="text-xl font-black text-fleet-night">No completed trips</h3>
              <p className="mt-2 text-sm font-semibold text-slate-600">Accepted jobs will move here after delivery.</p>
              <Button type="button" className="mt-4" onClick={onToggleOnline}>{online ? "Go offline" : "Go online"}</Button>
            </Card>
          )}
        </div>
      </section>
    </div>
  );
}

function ActiveJobLauncher({ job, trackingActive, trackingMessage, onOpen }: { job: JobRow; trackingActive: boolean; trackingMessage: string | null; onOpen: () => void }) {
  return (
    <Card className="border-fleet-ember/30 p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-fleet-night text-white shadow-[0_14px_30px_rgba(8,17,31,0.18)]">
          <MessageCircle className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone="blue">Active delivery</StatusBadge>
            {trackingActive ? <StatusBadge tone="green">Tracking on</StatusBadge> : null}
          </div>
          <h2 className="mt-2 break-words text-xl font-black leading-tight text-fleet-night">{job.delivery_code}</h2>
          <p className="mt-1 line-clamp-2 text-sm font-semibold leading-6 text-slate-600">{job.pickup_address} to {job.dropoff_address}</p>
          {trackingMessage ? <p className="mt-2 text-xs font-bold leading-5 text-slate-500">{trackingMessage}</p> : null}
        </div>
      </div>
      <Button type="button" className="mt-4 w-full bg-fleet-navy hover:bg-fleet-night" onClick={onOpen}>
        <MessageCircle className="h-4 w-4" />
        Open active job messenger
      </Button>
    </Card>
  );
}

function IncomingJob({ job, expires, pickupEtaMinutes, pickupEtaLoading, liveLocation, onRespond }: { job: JobRow; expires: number; pickupEtaMinutes: number | null; pickupEtaLoading: boolean; liveLocation: LiveRiderLocation | null; onRespond: (job: JobRow, accepted: boolean) => void }) {
  const customerName = job.users?.full_name || "Customer";
  const routeDistance = Number(job.distance_km || 0);
  const distanceLabel = routeDistance > 0 ? `${routeDistance.toFixed(1)} km` : "Route distance pending";
  return (
    <Card className="border-fleet-gold p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <ProfileImage src={job.users?.avatar_url} name={customerName} className="h-14 w-14" />
          <div className="min-w-0">
	          <StatusBadge tone="amber">Incoming job</StatusBadge>
	          <h2 className="mt-3 text-2xl font-black text-fleet-night">{job.pickup_address} to {job.dropoff_address}</h2>
	          <p className="mt-2 text-sm font-semibold text-slate-600">{distanceLabel} · {formatMoney(job.price_ngn)} estimated earning</p>
	          <p className="mt-2 inline-flex rounded-fleet bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700">{pickupEtaLabel(pickupEtaMinutes, pickupEtaLoading, liveLocation)}</p>
	          <p className="mt-2 text-sm font-bold text-slate-600">Customer: {customerName} · {job.dropoff_contact || job.pickup_contact || job.users?.phone || "Phone pending"}</p>
	        </div>
	        </div>
	        <span className="grid h-14 w-14 place-items-center rounded-full border-4 border-fleet-navy text-lg font-black text-fleet-navy">{expires}</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button type="button" onClick={() => onRespond(job, true)} className="bg-emerald-600 hover:bg-emerald-700">Accept</Button>
        <Button type="button" variant="secondary" onClick={() => onRespond(job, false)}>Decline</Button>
      </div>
    </Card>
	  );
	}

function RiderAccountTypeCard({ accountType }: { accountType?: RiderAccountType | null }) {
  const label = riderAccountTypeLabel(accountType);
  const fastFleet = accountType === "fastfleets360";
  return (
    <div className={cn("mt-3 inline-flex w-full items-center justify-between gap-3 rounded-fleet border px-3 py-2 text-xs font-black sm:w-auto", fastFleet ? "border-fleet-navy/20 bg-fleet-navy text-white" : "border-amber-200 bg-amber-50 text-amber-800")}>
      <span className="uppercase tracking-[0.12em]">Rider tag</span>
      <strong>{label}</strong>
    </div>
  );
}

function IncomingJobModal({ job, expires, pickupEtaMinutes, pickupEtaLoading, liveLocation, onRespond }: { job: JobRow; expires: number; pickupEtaMinutes: number | null; pickupEtaLoading: boolean; liveLocation: LiveRiderLocation | null; onRespond: (job: JobRow, accepted: boolean) => void }) {
  return (
    <div className="fixed inset-0 z-[110] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <div className="w-full max-w-lg">
        <IncomingJob job={job} expires={expires} pickupEtaMinutes={pickupEtaMinutes} pickupEtaLoading={pickupEtaLoading} liveLocation={liveLocation} onRespond={onRespond} />
      </div>
    </div>
  );
}

function ActiveJobBottomSheet({
  job,
  proofFile,
  liveLocation,
  trackingActive,
  trackingMessage,
  deliveryPin,
  deliveryPinLoading,
  onStartTracking,
  onStopTracking,
  onProofFile,
  onAdvance,
  onDeliveryPin,
  onVerifyDeliveryPin,
  onClose
}: {
  job: JobRow;
  proofFile: File | null;
  liveLocation: LiveRiderLocation | null;
  trackingActive: boolean;
  trackingMessage: string | null;
  deliveryPin: string;
  deliveryPinLoading: boolean;
  onStartTracking: () => void;
  onStopTracking: () => void;
  onProofFile: (file: File | null) => void;
  onAdvance: (job: JobRow) => void;
  onDeliveryPin: (value: string) => void;
  onVerifyDeliveryPin: (job: JobRow) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[105] flex items-end bg-fleet-night/35 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div className="mx-auto max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-[28px] bg-fleet-paper shadow-[0_26px_80px_rgba(8,17,31,0.28)] sm:rounded-[28px]">
        <div className="sticky top-0 z-10 border-b border-fleet-line bg-fleet-paper/95 px-4 pb-3 pt-3 backdrop-blur-xl">
          <button type="button" onClick={onClose} className="mx-auto mb-3 block h-1.5 w-14 rounded-full bg-slate-300" aria-label="Close active job messenger" />
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[0.65rem] font-black uppercase tracking-[0.12em] text-fleet-ember">Ongoing job messenger</span>
              <h2 className="mt-1 text-lg font-black leading-tight text-fleet-night">{job.delivery_code}</h2>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-slate-500 shadow-[0_10px_24px_rgba(8,17,31,0.08)]" aria-label="Close active job messenger">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          <ActiveJob
            job={job}
            proofFile={proofFile}
            liveLocation={liveLocation}
            trackingActive={trackingActive}
            trackingMessage={trackingMessage}
            deliveryPin={deliveryPin}
            deliveryPinLoading={deliveryPinLoading}
            onStartTracking={onStartTracking}
            onStopTracking={onStopTracking}
            onProofFile={onProofFile}
            onAdvance={onAdvance}
            onDeliveryPin={onDeliveryPin}
            onVerifyDeliveryPin={onVerifyDeliveryPin}
          />
        </div>
      </div>
    </div>
  );
}

function ActiveJob({ job, proofFile, liveLocation, trackingActive, trackingMessage, deliveryPin, deliveryPinLoading, onStartTracking, onStopTracking, onProofFile, onAdvance, onDeliveryPin, onVerifyDeliveryPin }: { job: JobRow; proofFile: File | null; liveLocation: LiveRiderLocation | null; trackingActive: boolean; trackingMessage: string | null; deliveryPin: string; deliveryPinLoading: boolean; onStartTracking: () => void; onStopTracking: () => void; onProofFile: (file: File | null) => void; onAdvance: (job: JobRow) => void; onDeliveryPin: (value: string) => void; onVerifyDeliveryPin: (job: JobRow) => void }) {
  const proofRequired = job.status === "picked_up" && isCustomerPickupProofRequired(job.metadata);
  const proof = pickupProofFromMetadata(job.metadata);
  const needsUpload = proofRequired && pickupProofNeedsUpload(job.metadata);
  const pendingReview = proofRequired && proof?.status === "pending" && !pickupProofReviewExpired(proof);
  const reviewSeconds = pickupProofReviewSecondsRemaining(proof);
  const label =
    job.status === "accepted"
      ? "I've arrived at pickup"
      : job.status === "rider_arrived"
        ? "Package collected"
        : job.status === "picked_up" && needsUpload
          ? "Upload package photo"
          : job.status === "picked_up" && pendingReview
            ? "Waiting for customer"
            : job.status === "picked_up"
              ? "Start trip"
              : job.status === "in_transit"
                ? "Arrived at drop-off"
                : job.status === "awaiting_delivery_confirmation"
                  ? "Enter delivery PIN"
                : "Complete delivery";
  const actionDisabled = Boolean((needsUpload && !proofFile) || pendingReview);
  const customerName = job.users?.full_name || "Customer";
  const customerPhone = job.dropoff_contact || job.pickup_contact || job.users?.phone || "";
  const messages = activeJobMessages(job, customerName, trackingActive, proofRequired, proof?.status || null, needsUpload, pendingReview);
  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-fleet-line bg-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <StatusBadge tone="blue">Active delivery</StatusBadge>
            <h2 className="mt-3 break-words text-2xl font-black text-fleet-night">{job.delivery_code}</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{job.pickup_address} to {job.dropoff_address}</p>
          </div>
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-fleet-navy text-white">
            <MessageCircle className="h-5 w-5" />
          </span>
        </div>
      </div>

      <div className="bg-fleet-paper/70 p-3 sm:p-4">
        <RoutePreview
          compact
          className="min-h-[260px] rounded-[18px]"
          label="Live route"
          status={job.status}
          riderName="Your route"
          pickupAddress={job.pickup_address}
          dropoffAddress={job.dropoff_address}
          riderLocation={liveLocation}
          customerAvatarUrl={job.users?.avatar_url}
          customerName={customerName}
        />
      </div>

      <div className="grid gap-3 border-b border-fleet-line bg-white p-4 sm:grid-cols-3 sm:p-5">
        <RiderRoomDetail icon={UserRound} label="Customer" value={customerName} />
        <RiderRoomDetail icon={Phone} label="Phone" value={customerPhone || "Not provided"} />
        <RiderRoomDetail icon={Navigation2} label="Next action" value={label} />
      </div>

      <div className="grid gap-3 bg-[#f7fafc] p-3 sm:p-5">
        {messages.map((message) => <ActiveJobBubble key={message.key} message={message} />)}

        {proofRequired ? (
          <div className="rounded-[20px] border border-fleet-line bg-white p-4 shadow-[0_14px_36px_rgba(8,17,31,0.08)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.12em] text-fleet-ember">FastConfirm™</span>
                <p className="mt-1 text-sm font-bold leading-5 text-slate-600">
                  {pickupProofStatusMessage(proof)} {pendingReview && reviewSeconds ? `Auto-release in ${Math.ceil(reviewSeconds / 60)} min.` : ""}
                </p>
              </div>
              <StatusBadge tone={proof?.status === "approved" || proof?.status === "auto_approved" ? "green" : proof?.status === "rejected" ? "red" : "amber"}>
                {proof?.status ? proof.status.replaceAll("_", " ") : "Needed"}
              </StatusBadge>
            </div>
            {proof?.url ? <Image src={`/api/uploads/access?scope=delivery-proof&id=${encodeURIComponent(job.id)}`} alt="Package pickup proof" width={720} height={360} unoptimized className="mt-3 max-h-64 w-full rounded-fleet object-cover" /> : null}
            {needsUpload ? (
              <label className="form-field mt-3">
                <span className="form-label">Package pickup photo</span>
                <input className="form-input py-3" type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={(event) => { onProofFile(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
                {proofFile ? <span className="text-xs font-bold text-slate-500">{proofFile.name}</span> : null}
              </label>
            ) : null}
          </div>
        ) : null}

        {job.status === "awaiting_delivery_confirmation" ? (
          <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-3 sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-fleet-ember">Secure handoff</span>
                <h3 className="mt-1 text-base font-black text-fleet-night">Enter the recipient&apos;s delivery PIN</h3>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">The customer can also confirm delivery directly from their messenger.</p>
              </div>
              <StatusBadge tone="amber">Awaiting PIN</StatusBadge>
            </div>
            <input
              className="form-input mt-3 text-center font-mono text-2xl font-black tracking-[0.25em]"
              value={deliveryPin}
              onChange={(event) => onDeliveryPin(event.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              aria-label="Six-digit delivery PIN"
            />
            <Button type="button" className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700" disabled={deliveryPinLoading || deliveryPin.length !== 6} onClick={() => onVerifyDeliveryPin(job)}>
              {deliveryPinLoading ? "Verifying PIN..." : "Verify PIN and complete delivery"}
            </Button>
            <LinkButton href={`/support?topic=delivery-confirmation&delivery=${job.delivery_code}`} variant="secondary" className="mt-2 w-full">
              Recipient unavailable or PIN issue
            </LinkButton>
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2">
          {customerPhone ? (
            <LinkButton href={`tel:${customerPhone}`} variant="secondary" className="w-full">
              <Phone className="h-4 w-4" />
              Call customer
            </LinkButton>
          ) : null}
          {job.status !== "awaiting_delivery_confirmation" ? (
            <Button type="button" variant={trackingActive ? "secondary" : "primary"} onClick={trackingActive ? onStopTracking : onStartTracking}>
              {trackingActive ? "Stop Delivery Tracking" : "Start Delivery Tracking"}
            </Button>
          ) : null}
        </div>
        {trackingMessage ? <div className="rounded-fleet bg-white p-3 text-xs font-bold leading-5 text-slate-600">{trackingMessage}</div> : null}
        {job.status !== "awaiting_delivery_confirmation" ? <Button type="button" className="w-full bg-fleet-navy hover:bg-fleet-night" disabled={actionDisabled} onClick={() => onAdvance(job)}>{label}</Button> : null}
      </div>
    </Card>
  );
}

function RiderRoomDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[16px] bg-fleet-paper p-3">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white text-fleet-ember">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
        <strong className="mt-1 block break-words text-sm font-black text-fleet-night">{value}</strong>
      </span>
    </div>
  );
}

type ActiveJobMessage = {
  key: string;
  meta: string;
  title: string;
  body: string;
  active?: boolean;
};

function ActiveJobBubble({ message }: { message: ActiveJobMessage }) {
  return (
    <div className="flex justify-start">
      <div className={cn("max-w-[88%] rounded-[16px] rounded-bl-md bg-white px-3 py-2.5 shadow-[0_9px_24px_rgba(8,17,31,0.07)] sm:max-w-[72%]", message.active && "ring-2 ring-fleet-gold/70")}>
        <div className="flex items-center gap-2">
          {message.active ? <span className="h-2 w-2 animate-pulseSoft rounded-full bg-fleet-gold" /> : null}
          <span className="text-[0.58rem] font-black uppercase tracking-[0.1em] text-slate-500">{message.meta}</span>
        </div>
        <strong className="mt-0.5 block text-sm font-black leading-5 text-fleet-night">{message.title}</strong>
        <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-600">{message.body}</p>
      </div>
    </div>
  );
}

function activeJobMessages(job: JobRow, customerName: string, trackingActive: boolean, proofRequired: boolean, proofStatus: string | null, needsUpload: boolean, pendingReview: boolean): ActiveJobMessage[] {
  const messages: ActiveJobMessage[] = [
    {
      key: "accepted",
      meta: "Dispatch",
      title: "You accepted this job",
      body: `Head to pickup and keep ${customerName} updated through the delivery timeline.`,
      active: job.status === "accepted"
    },
    {
      key: "rider_arrived",
      meta: "Pickup",
      title: "You are at pickup",
      body: "Confirm the package handoff when it is collected from the sender.",
      active: job.status === "rider_arrived"
    },
    {
      key: "picked_up",
      meta: "FastConfirm™",
      title: proofRequired ? "Package photo review" : "Package collected",
      body: proofRequired
        ? needsUpload
          ? "Upload a clear package photo so the customer can confirm it before the trip starts."
          : pendingReview
            ? "Waiting for the customer to confirm the package photo."
            : `FastConfirm™ status: ${proofStatus ? proofStatus.replaceAll("_", " ") : "ready"}.`
        : "Package pickup has been marked complete. Start the trip when ready.",
      active: job.status === "picked_up"
    },
    {
      key: "in_transit",
      meta: trackingActive ? "Live movement" : "Tracking",
      title: "Trip in progress",
      body: trackingActive ? "Live delivery tracking is sharing your route movement." : "Start delivery tracking so the customer can follow the route.",
      active: job.status === "in_transit"
    },
    {
      key: "awaiting_delivery_confirmation",
      meta: "Secure handoff",
      title: "Waiting for recipient confirmation",
      body: "Ask the recipient for the six-digit PIN only after handing over the package.",
      active: job.status === "awaiting_delivery_confirmation"
    }
  ];
  return messages.filter((message) => isActiveJobMessageVisible(message.key, job.status));
}

function isActiveJobMessageVisible(key: string, status: string) {
  const order = ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"];
  const statusIndex = order.indexOf(status);
  const messageIndex = order.indexOf(key);
  return statusIndex >= 0 && messageIndex <= statusIndex;
}

function JobsTab({ loading, jobs, online, onToggleOnline }: { loading: boolean; jobs: JobRow[]; online: boolean; onToggleOnline: () => void }) {
  const [filter, setFilter] = useState<"active" | "available" | "completed">("active");
  if (loading) return <DashboardSkeleton />;
  const filteredJobs = jobs.filter((job) => {
    if (filter === "available") return job.status === "searching";
    if (filter === "completed") return job.status === "delivered";
    return ["accepted", "rider_arrived", "picked_up", "in_transit", "awaiting_delivery_confirmation"].includes(job.status);
  });
  return (
    <div className="grid gap-4">
      <div className="flex gap-2">{(["active", "available", "completed"] as const).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={cn("rounded-full px-4 py-2 text-sm font-black capitalize", filter === item ? "bg-fleet-navy text-white" : "bg-white text-slate-600")}>{item}</button>)}</div>
      {filteredJobs.length ? filteredJobs.map((job) => <TripCard key={job.id} job={job} />) : (
        <Card className="p-5 text-center">
          <h3 className="text-xl font-black text-fleet-night">No jobs in this view</h3>
          <p className="mt-2 text-sm font-semibold text-slate-600">Go online to receive offers, then accept and advance each job from pickup to delivery.</p>
          <Button type="button" className="mt-4" onClick={onToggleOnline}>{online ? "Go offline" : "Go online"}</Button>
        </Card>
      )}
    </div>
  );
}

function EarningsTab({ todayEarnings, withdrawals }: { todayEarnings: number; withdrawals: WithdrawalRow[] }) {
  const settledWithdrawals = withdrawals.slice(0, 14).map((item) => Number(item.amount_ngn || 0));
  const chartValues = settledWithdrawals.length ? settledWithdrawals : [0];
  const max = Math.max(...chartValues, 1);
  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Today" value={formatMoney(todayEarnings)} />
        <Stat label="Withdrawal records" value={String(withdrawals.length)} />
      </div>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Last 14 days</h2>
        <div className="mt-5 flex h-48 items-end gap-2">
          {chartValues.map((value, index) => <span key={`${value}-${index}`} className="flex-1 rounded-t bg-fleet-navy" style={{ height: `${Math.max(12, (value / max) * 100)}%` }} title={formatMoney(value)} />)}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="text-xl font-black text-fleet-night">Withdrawal history</h2>
        <div className="mt-4 grid gap-3">{withdrawals.length ? withdrawals.map((item) => <div key={item.id} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3"><span><strong className="block text-sm font-black text-fleet-night">{formatMoney(item.amount_ngn)}</strong><span className="text-xs font-semibold text-slate-500">{formatDateTime(item.created_at)}</span></span><StatusBadge tone={item.status === "paid" ? "green" : "amber"}>{item.status}</StatusBadge></div>) : <DashboardEmptyState title="No withdrawals yet" body="Withdrawal requests will appear here after you submit one." ctaLabel="Withdraw" ctaHref="/rider/dashboard" icon={<Banknote className="h-7 w-7" />} />}</div>
      </Card>
    </div>
  );
}

function ProfileImage({ src, name, className }: { src?: string | null; name: string; className?: string }) {
  if (src) {
    return <Image src={src} alt="" width={96} height={96} className={cn("shrink-0 rounded-full object-cover", className)} />;
  }
  return <span className={cn("grid shrink-0 place-items-center rounded-full bg-fleet-navy text-lg font-black text-white", className)}>{initials(name)}</span>;
}

function AccountTab({ profile, onProfile, kycStatus, prefs, onPrefs }: { profile: RiderProfile; onProfile: (profile: RiderProfile) => void; kycStatus: KycStatus; prefs: { jobs: boolean; payouts: boolean; sms: boolean }; onPrefs: (prefs: { jobs: boolean; payouts: boolean; sms: boolean }) => void }) {
  const approved = kycStatus === "approved";
  const kycTone = approved ? "green" : kycStatus === "rejected" ? "red" : "amber";
  const [photoMessage, setPhotoMessage] = useState<string | null>(profile.avatar_url ? null : "Upload a profile picture so customers can identify you.");
  const [photoLoading, setPhotoLoading] = useState(false);

  async function handlePhoto(file: File | null) {
    if (!file) return;
    setPhotoLoading(true);
    setPhotoMessage("Uploading profile picture...");
    try {
      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in again to upload your profile picture.");
      const upload = await uploadProfilePhoto(file);
      onProfile({ ...profile, avatar_url: upload.publicUrl });
      setPhotoMessage("Profile picture updated.");
    } catch (error) {
      setPhotoMessage(error instanceof Error ? error.message : "Could not upload profile picture.");
    } finally {
      setPhotoLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      <Card className="p-5">
        <div className="flex items-center gap-4">
          <ProfileImage src={profile.avatar_url} name={profile.full_name || "Rider"} className="h-16 w-16" />
          <div className="min-w-0">
            <h2 className="text-xl font-black text-fleet-night">{profile.full_name || "Rider"}</h2>
            <p className="text-sm font-semibold text-slate-500">{profile.phone || "No phone"} · {profile.lga || "Lagos"}</p>
            <label className="mt-3 inline-flex cursor-pointer items-center justify-center rounded-fleet border border-white/70 bg-white/90 px-3 py-2 text-xs font-black text-fleet-night shadow-[0_10px_26px_rgba(8,17,31,0.08)]">
              {photoLoading ? "Uploading..." : profile.avatar_url ? "Change profile picture" : "Upload profile picture"}
              <input className="sr-only" type="file" accept={IMAGE_UPLOAD_ACCEPT} onChange={(event) => { void handlePhoto(event.target.files?.[0] || null); event.currentTarget.value = ""; }} />
            </label>
          </div>
        </div>
        {photoMessage ? <div className="mt-4 rounded-fleet bg-fleet-paper p-3 text-xs font-bold leading-5 text-slate-600">{photoMessage}</div> : null}
      </Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Vehicle details</h2><div className="mt-4 grid gap-3 text-sm font-bold text-slate-600"><Info label="Vehicle" value={profile.vehicle_type || "Motorcycle"} /><Info label="Plate" value={profile.plate_number || "Pending"} /><Info label="Colour" value={profile.vehicle_color || "Pending"} /></div><p className="mt-4 text-xs font-bold text-slate-500">Vehicle edits require re-submission.</p></Card>
      <Card className="p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-black text-fleet-night">KYC document status</h2><StatusBadge tone={kycTone}>{kycStatus.replaceAll("_", " ")}</StatusBadge></div><div className="mt-4 grid gap-2">{["Government ID", "Driver's Licence", "Vehicle registration", "Vehicle picture"].map((item) => <div key={item} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black text-fleet-night"><span>{item}</span><StatusBadge tone={kycTone}>{approved ? "Approved" : "Review"}</StatusBadge></div>)}</div><LinkButton href="/rider/onboarding" variant="secondary" className="mt-4 w-full">Update KYC</LinkButton></Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Rating breakdown</h2><p className="mt-3 text-3xl font-black text-fleet-night">{(profile.rating || 4.9).toFixed(1)} <Star className="inline h-6 w-6 fill-fleet-gold text-fleet-gold" /></p><p className="mt-1 text-sm font-semibold text-slate-600">{profile.completed_deliveries || 0} total trips</p></Card>
      <Card className="p-5"><h2 className="text-xl font-black text-fleet-night">Notifications</h2><div className="mt-4 grid gap-3">{(["jobs", "payouts", "sms"] as const).map((key) => <label key={key} className="flex items-center justify-between rounded-fleet bg-fleet-paper p-3 text-sm font-black capitalize text-fleet-night">{key}<input type="checkbox" className="h-5 w-5 accent-fleet-navy" checked={prefs[key]} onChange={(event) => onPrefs({ ...prefs, [key]: event.target.checked })} /></label>)}</div></Card>
      <Card className="p-5"><AccountDeletionButton /><Button type="button" variant="secondary" className="mt-3 w-full" onClick={async () => { const supabase = createClient(); await supabase.auth.signOut(); await clearServiceWorkerSession().catch(() => undefined); window.location.assign("/auth"); }}>Sign out</Button></Card>
    </div>
  );
}

function WithdrawalModal({ amount, onAmount, profile, loading, message, onClose, onSubmit }: { amount: string; onAmount: (value: string) => void; profile: RiderProfile; loading: boolean; message: string | null; onClose: () => void; onSubmit: () => void }) {
  return (
    <div className="fixed inset-0 z-[120] grid place-items-end bg-fleet-night/35 p-3 sm:place-items-center">
      <Card className="w-full max-w-md p-5">
        <h2 className="text-2xl font-black text-fleet-night">Request withdrawal</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">{profile.bank_name || "Bank pending"} · {profile.account_number || "Account pending"} · {profile.account_name || "Name pending"}</p>
        <p className="mt-2 text-xs font-bold leading-5 text-slate-500">Minimum NGN 2,000. Maximum NGN 200,000 per request. Approved payouts are credited within 10 business hours.</p>
        <label className="form-field mt-5"><span className="form-label">Amount</span><input className="form-input" value={amount} onChange={(event) => onAmount(event.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="5000" /></label>
        {message ? <div className="mt-3 rounded-fleet bg-amber-50 p-3 text-sm font-bold text-amber-800">{message}</div> : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="button" disabled={loading || !amount} onClick={onSubmit}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Submit</Button></div>
      </Card>
    </div>
  );
}

function TripCard({ job }: { job: JobRow }) {
  return <article className="rounded-fleet border border-fleet-line bg-white p-4"><div className="flex items-start justify-between gap-3"><span><strong className="block text-sm font-black text-fleet-night">{job.delivery_code}</strong><span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{job.pickup_address} to {job.dropoff_address}</span></span><StatusBadge tone={job.status === "delivered" ? "green" : "blue"}>{job.status.replaceAll("_", " ")}</StatusBadge></div><div className="mt-3 flex items-center justify-between text-sm font-black text-fleet-night"><span>{formatMoney(job.price_ngn)}</span><span>{job.eta_minutes || 30} min</span></div></article>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="p-3"><p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-slate-500">{label}</p><strong className="mt-2 block text-lg font-black text-fleet-night">{value}</strong></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-fleet bg-fleet-paper p-3"><span className="block text-xs font-black uppercase tracking-[0.12em] text-slate-500">{label}</span><strong className="block text-sm font-black text-fleet-night">{value}</strong></div>;
}

function DashboardSkeleton() {
  return <div className="grid gap-4"><Skeleton className="h-36" /><div className="grid grid-cols-3 gap-3"><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /></div><Skeleton className="h-64" /></div>;
}
