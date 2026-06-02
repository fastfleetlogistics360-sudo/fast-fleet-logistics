import type { DeliverySpeed, FareEstimate, FareInput, VehicleType } from "@/types/domain";

const VEHICLE_PRICING: Record<VehicleType, { base: number; perKm: number; speedKmh: number; label: string }> = {
  bike: { base: 1800, perKm: 240, speedKmh: 31, label: "Bike" },
  car: { base: 3600, perKm: 360, speedKmh: 25, label: "Car" },
  van: { base: 7200, perKm: 620, speedKmh: 20, label: "Van" }
};

const SPEED_MULTIPLIERS: Record<DeliverySpeed, number> = {
  standard: 1,
  same_day: 1.14,
  express: 1.32,
  priority: 1.68,
  scheduled: 1.08,
  interstate: 1.92
};

export const PLATFORM_CHECKOUT_FEE_NGN = 500;

type FareComputationInput = {
  distanceKm: number;
  vehicle: VehicleType;
  speed: DeliverySpeed;
  zone?: string;
};

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function estimateDistanceKm(pickup: string, dropoff: string, speed: DeliverySpeed) {
  const seed = stableHash(`${pickup}|${dropoff}|${speed}`);
  const cityDistance = Math.max(2.2, Math.round(((seed % 340) / 10 + 3.4) * 10) / 10);

  if (speed === "interstate") {
    return Math.max(42, Math.round((cityDistance + 38) * 10) / 10);
  }

  return cityDistance;
}

export function estimateFare(input: FareInput): FareEstimate {
  const distanceKm = estimateDistanceKm(input.pickup, input.dropoff, input.speed);
  return buildFareEstimate({
    distanceKm,
    vehicle: input.vehicle,
    speed: input.speed,
    zone: input.zone
  });
}

export function estimateFareForDistance(input: Partial<FareComputationInput> & { distanceKm: number }): FareEstimate {
  return buildFareEstimate({
    distanceKm: Math.max(1, Math.round(input.distanceKm * 10) / 10),
    vehicle: input.vehicle || "bike",
    speed: input.speed || "express",
    zone: input.zone
  });
}

function buildFareEstimate(input: FareComputationInput): FareEstimate {
  const vehicle = VEHICLE_PRICING[input.vehicle] ?? VEHICLE_PRICING.bike;
  const speedMultiplier = SPEED_MULTIPLIERS[input.speed] ?? 1;
  const zoneSurcharge = input.zone?.toLowerCase().includes("ogun") ? 800 : 0;
  const baseFare = vehicle.base + zoneSurcharge;
  const distanceFare = input.distanceKm * vehicle.perKm;
  const deliveryFee = Math.round(((baseFare + distanceFare) * speedMultiplier) / 50) * 50;
  const platformFee = PLATFORM_CHECKOUT_FEE_NGN;
  const total = deliveryFee + platformFee;
  const etaMinutes = Math.max(
    16,
    Math.round((input.distanceKm / vehicle.speedKmh) * 60 + (input.speed === "priority" ? 10 : 22))
  );

  return {
    distanceKm: input.distanceKm,
    etaMinutes,
    baseFare,
    distanceFare,
    speedMultiplier,
    deliveryFee,
    platformFee,
    total,
    currency: "NGN"
  };
}

export function vehicleLabel(vehicle: VehicleType) {
  return VEHICLE_PRICING[vehicle]?.label ?? "Bike";
}

export function speedLabel(speed: DeliverySpeed) {
  const labels: Record<DeliverySpeed, string> = {
    standard: "Standard",
    same_day: "Same-day",
    express: "Express",
    priority: "Priority",
    scheduled: "Scheduled",
    interstate: "Inter-state"
  };

  return labels[speed];
}
