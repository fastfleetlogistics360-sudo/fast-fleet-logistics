import { geocodeAddress } from "@/lib/maps/geocode";
import { createAdminClient } from "@/lib/supabase/admin";

export const campusProgramSettingsKey = "campus_program";
export const KWASU_CAMPUS_ZONE_ID = "kwasu-campus";

export type CampusLecturerEnrollment = {
  userId: string;
  active: boolean;
  addedAt?: string;
  addedBy?: string;
};

export type CampusProgram = {
  enabled: boolean;
  zoneId: string;
  universityName: string;
  universityAddress: string;
  universityPlaceId?: string;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm: number;
  bicycleCapKm: number;
  normalPricingAfterKm: number;
  deliveryFeeCapNgn: number;
  overagePerKmNgn: number;
  bicycleSpeedKmh: number;
  riderPriorityMinutes: number;
  lecturerEnrollments: CampusLecturerEnrollment[];
};

export const DEFAULT_CAMPUS_PROGRAM: CampusProgram = {
  enabled: false,
  zoneId: KWASU_CAMPUS_ZONE_ID,
  universityName: "Kwara State University (KWASU)",
  universityAddress: "",
  universityPlaceId: "",
  latitude: null,
  longitude: null,
  radiusKm: 20,
  bicycleCapKm: 20,
  normalPricingAfterKm: 30,
  deliveryFeeCapNgn: 1000,
  overagePerKmNgn: 80,
  bicycleSpeedKmh: 15,
  riderPriorityMinutes: 4,
  lecturerEnrollments: []
};

export async function loadCampusProgram(): Promise<CampusProgram> {
  const db = createAdminClient();
  if (!db) return DEFAULT_CAMPUS_PROGRAM;
  const { data } = await db.from("platform_settings").select("value").eq("key", campusProgramSettingsKey).maybeSingle<{ value?: unknown | null }>();
  return normalizeCampusProgram(data?.value);
}

export type CampusPriceAdjustment = {
  applied: boolean;
  campusZoneId: string | null;
  deliveryFee: number;
  platformFee: number;
  totalDiscount: number;
  riderEarningNgn: number;
  pricingBand: "within_20" | "overage_20_30" | "normal";
};

export type LecturerBenefit = {
  applied: boolean;
  message: string | null;
  distanceFromUniversityKm: number | null;
  waivedDeliveryFee: number;
  waivedPlatformFee: number;
};

export function normalizeCampusProgram(value: unknown): CampusProgram {
  const input = value && typeof value === "object" ? (value as Partial<CampusProgram>) : {};
  const enrollments: CampusLecturerEnrollment[] = Array.isArray(input.lecturerEnrollments)
    ? input.lecturerEnrollments
        .map((entry) => {
          const value = entry && typeof entry === "object" ? (entry as Partial<CampusLecturerEnrollment>) : {};
          const userId = text(value.userId);
          if (!userId) return null;
          const normalized: CampusLecturerEnrollment = { userId, active: value.active !== false };
          const addedAt = text(value.addedAt);
          const addedBy = text(value.addedBy);
          if (addedAt) normalized.addedAt = addedAt;
          if (addedBy) normalized.addedBy = addedBy;
          return normalized;
        })
        .filter((entry): entry is CampusLecturerEnrollment => entry !== null)
    : [];

  const bicycleCapKm = clamp(input.bicycleCapKm, 1, 30, DEFAULT_CAMPUS_PROGRAM.bicycleCapKm, 1);
  const normalPricingAfterKm = clamp(input.normalPricingAfterKm, bicycleCapKm, 50, DEFAULT_CAMPUS_PROGRAM.normalPricingAfterKm, 1);
  return {
    enabled: Boolean(input.enabled),
    zoneId: text(input.zoneId) || KWASU_CAMPUS_ZONE_ID,
    universityName: text(input.universityName) || DEFAULT_CAMPUS_PROGRAM.universityName,
    universityAddress: text(input.universityAddress),
    universityPlaceId: text(input.universityPlaceId),
    latitude: coordinate(input.latitude, 90),
    longitude: coordinate(input.longitude, 180),
    radiusKm: clamp(input.radiusKm, 1, 50, DEFAULT_CAMPUS_PROGRAM.radiusKm, 1),
    bicycleCapKm,
    normalPricingAfterKm,
    deliveryFeeCapNgn: clamp(input.deliveryFeeCapNgn, 0, 100000, DEFAULT_CAMPUS_PROGRAM.deliveryFeeCapNgn),
    overagePerKmNgn: clamp(input.overagePerKmNgn, 1, 10000, DEFAULT_CAMPUS_PROGRAM.overagePerKmNgn),
    bicycleSpeedKmh: clamp(input.bicycleSpeedKmh, 5, 40, DEFAULT_CAMPUS_PROGRAM.bicycleSpeedKmh, 1),
    riderPriorityMinutes: clamp(input.riderPriorityMinutes, 1, 30, DEFAULT_CAMPUS_PROGRAM.riderPriorityMinutes),
    lecturerEnrollments: Array.from(new Map(enrollments.map((entry) => [entry.userId, entry])).values())
  };
}

export function campusVendorZoneId(items: Array<{ campusZoneId?: unknown; campus_zone_id?: unknown }> | null | undefined) {
  const zones = new Set(
    (items || [])
      .map((item) => text(item.campusZoneId || item.campus_zone_id))
      .filter(Boolean)
  );
  return zones.size === 1 ? Array.from(zones)[0] : "";
}

export function applyCampusPrice(input: {
  program: CampusProgram;
  campusZoneId?: string | null;
  distanceKm: number;
  deliveryFee: number;
  platformFee: number;
  bicycleEligible: boolean;
}) : CampusPriceAdjustment {
  const deliveryFee = money(input.deliveryFee);
  const platformFee = money(input.platformFee);
  const eligible = input.program.enabled
    && input.campusZoneId === input.program.zoneId
    && input.bicycleEligible
    && input.distanceKm > 0
    && input.distanceKm <= input.program.normalPricingAfterKm;

  if (!eligible) {
    return { applied: false, campusZoneId: null, deliveryFee, platformFee, totalDiscount: 0, riderEarningNgn: deliveryFee, pricingBand: "normal" };
  }

  const campusDeliveryFee = input.distanceKm <= input.program.bicycleCapKm
    ? Math.min(deliveryFee, input.program.deliveryFeeCapNgn)
    : Math.min(
        deliveryFee,
        input.program.deliveryFeeCapNgn + Math.max(0, input.distanceKm - input.program.bicycleCapKm) * input.program.overagePerKmNgn
      );
  const roundedDeliveryFee = Math.max(0, Math.round(campusDeliveryFee / 50) * 50);
  return {
    applied: true,
    campusZoneId: input.program.zoneId,
    deliveryFee: roundedDeliveryFee,
    platformFee,
    totalDiscount: Math.max(0, deliveryFee - roundedDeliveryFee),
    riderEarningNgn: roundedDeliveryFee,
    pricingBand: input.distanceKm <= input.program.bicycleCapKm ? "within_20" : "overage_20_30"
  };
}

export async function resolveLecturerBenefit(input: {
  program: CampusProgram;
  userId: string | null | undefined;
  address: string;
  deliveryFee: number;
  platformFee: number;
}) : Promise<LecturerBenefit> {
  const enrolled = Boolean(input.userId && input.program.enabled && input.program.lecturerEnrollments.some((entry) => entry.userId === input.userId && entry.active));
  if (!enrolled || !input.address.trim()) return emptyLecturerBenefit();

  const universityPoint = await campusPoint(input.program);
  const addressPoint = await geocodeAddress(input.address);
  if (!universityPoint || !addressPoint) return emptyLecturerBenefit();

  const distanceFromUniversityKm = haversineKm(universityPoint, addressPoint);
  if (distanceFromUniversityKm > input.program.radiusKm) return { ...emptyLecturerBenefit(), distanceFromUniversityKm };

  return {
    applied: true,
    distanceFromUniversityKm,
    waivedDeliveryFee: money(input.deliveryFee),
    waivedPlatformFee: money(input.platformFee),
    message: `Thank you for the work you do in shaping the future at ${input.program.universityName}. In appreciation of your impact, Fast Fleets 360 is covering your delivery and platform fees for this order.`
  };
}

export function campusFeeMetadata(input: {
  program: CampusProgram;
  adjustment: CampusPriceAdjustment;
  lecturerBenefit?: LecturerBenefit | null;
}) {
  const lecturer = input.lecturerBenefit;
  return {
    campus_zone_id: input.adjustment.campusZoneId,
    campus_pricing_applied: input.adjustment.applied,
    campus_pricing_band: input.adjustment.pricingBand,
    campus_bicycle_cap_km: input.adjustment.applied ? input.program.normalPricingAfterKm : null,
    campus_delivery_fee_ngn: input.adjustment.deliveryFee,
    campus_rider_earning_ngn: input.adjustment.riderEarningNgn,
    campus_subsidy_ngn: input.adjustment.totalDiscount + (lecturer?.applied ? lecturer.waivedDeliveryFee + lecturer.waivedPlatformFee : 0),
    lecturer_benefit_applied: Boolean(lecturer?.applied),
    lecturer_benefit_distance_km: lecturer?.distanceFromUniversityKm ?? null,
    lecturer_message: lecturer?.applied ? lecturer.message : null
  };
}

async function campusPoint(program: CampusProgram) {
  const latitude = coordinate(program.latitude, 90);
  const longitude = coordinate(program.longitude, 180);
  if (latitude !== null && longitude !== null) return { latitude, longitude };
  return geocodeAddress(program.universityAddress);
}

function emptyLecturerBenefit(): LecturerBenefit {
  return { applied: false, message: null, distanceFromUniversityKm: null, waivedDeliveryFee: 0, waivedPlatformFee: 0 };
}

function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLng = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)) * 10) / 10;
}

function text(value: unknown) { return String(value || "").trim(); }
function money(value: unknown) { const amount = Number(value || 0); return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0; }
function coordinate(value: unknown, max: number) { const number = Number(value); return Number.isFinite(number) && Math.abs(number) <= max ? number : null; }
function clamp(value: unknown, min: number, max: number, fallback: number, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const scale = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(number * scale) / scale));
}
