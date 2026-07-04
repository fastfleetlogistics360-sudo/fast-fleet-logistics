import type { DeliverySpeed, FareEstimate, VehicleType } from "@/types/domain";

export type FareVehicleConfig = {
  base: number;
  perKm: number;
  speedKmh: number;
  label: string;
};

export type FareConfig = {
  vehicles: Record<VehicleType, FareVehicleConfig>;
  bicycle: FareVehicleConfig;
  speedMultipliers: Record<DeliverySpeed, number>;
  platformFee: number;
  bicyclePlatformFee: number;
  bicycleMaxDistanceKm: number;
  ogunSurcharge: number;
};

export const DEFAULT_FARE_CONFIG: FareConfig = {
  vehicles: {
    bike: { base: 1800, perKm: 240, speedKmh: 31, label: "Bike" },
    car: { base: 3600, perKm: 360, speedKmh: 25, label: "Car" },
    van: { base: 7200, perKm: 620, speedKmh: 20, label: "Van" }
  },
  bicycle: { base: 900, perKm: 150, speedKmh: 18, label: "Bicycle" },
  speedMultipliers: {
    standard: 1,
    same_day: 1.14,
    express: 1.32,
    priority: 1.68,
    scheduled: 1.08,
    interstate: 1.92
  },
  platformFee: 500,
  bicyclePlatformFee: 300,
  bicycleMaxDistanceKm: 10,
  ogunSurcharge: 800
};

export const PLATFORM_CHECKOUT_FEE_NGN = 500;

export const fareVehicleTypes: VehicleType[] = ["bike", "car", "van"];
export const fareSpeedTypes: DeliverySpeed[] = ["standard", "same_day", "express", "priority", "scheduled", "interstate"];

type FareComputationInput = {
  distanceKm: number;
  vehicle: VehicleType;
  speed: DeliverySpeed;
  zone?: string;
};

export function normalizeFareConfig(value: unknown): FareConfig {
  const input = (value || {}) as Partial<FareConfig>;
  const vehicles = (input.vehicles || {}) as Partial<Record<VehicleType, Partial<FareVehicleConfig>>>;
  const bicycle = (input.bicycle || {}) as Partial<FareVehicleConfig>;
  const speedMultipliers = (input.speedMultipliers || {}) as Partial<Record<DeliverySpeed, number>>;

  return {
    vehicles: fareVehicleTypes.reduce((next, vehicle) => {
      const fallback = DEFAULT_FARE_CONFIG.vehicles[vehicle];
      const current = vehicles[vehicle] || {};
      next[vehicle] = {
        base: clampNumber(current.base, 100, 500000, fallback.base),
        perKm: clampNumber(current.perKm, 10, 50000, fallback.perKm),
        speedKmh: clampNumber(current.speedKmh, 5, 180, fallback.speedKmh),
        label: fallback.label
      };
      return next;
    }, {} as FareConfig["vehicles"]),
    bicycle: {
      base: clampNumber(bicycle.base, 100, 500000, DEFAULT_FARE_CONFIG.bicycle.base),
      perKm: clampNumber(bicycle.perKm, 10, 50000, DEFAULT_FARE_CONFIG.bicycle.perKm),
      speedKmh: clampNumber(bicycle.speedKmh, 5, 80, DEFAULT_FARE_CONFIG.bicycle.speedKmh),
      label: DEFAULT_FARE_CONFIG.bicycle.label
    },
    speedMultipliers: fareSpeedTypes.reduce((next, speed) => {
      next[speed] = clampNumber(speedMultipliers[speed], 0.1, 10, DEFAULT_FARE_CONFIG.speedMultipliers[speed], 2);
      return next;
    }, {} as FareConfig["speedMultipliers"]),
    platformFee: clampNumber(input.platformFee, 0, 500000, DEFAULT_FARE_CONFIG.platformFee),
    bicyclePlatformFee: clampNumber(input.bicyclePlatformFee, 0, 500000, DEFAULT_FARE_CONFIG.bicyclePlatformFee),
    bicycleMaxDistanceKm: clampNumber(input.bicycleMaxDistanceKm, 1, 50, DEFAULT_FARE_CONFIG.bicycleMaxDistanceKm, 1),
    ogunSurcharge: clampNumber(input.ogunSurcharge, 0, 500000, DEFAULT_FARE_CONFIG.ogunSurcharge)
  };
}

export function estimateFareForDistance(
  input: Partial<FareComputationInput> & { distanceKm: number; vehicleSubtype?: "bicycle" | null },
  config: FareConfig = DEFAULT_FARE_CONFIG
): FareEstimate {
  return buildFareEstimate({
    distanceKm: Math.max(1, Math.round(input.distanceKm * 10) / 10),
    vehicle: input.vehicle || "bike",
    speed: input.speed || "express",
    zone: input.zone,
    vehicleSubtype: input.vehicleSubtype
  }, config);
}

function buildFareEstimate(input: FareComputationInput & { vehicleSubtype?: "bicycle" | null }, rawConfig: FareConfig): FareEstimate {
  const config = normalizeFareConfig(rawConfig);
  const vehicle = input.vehicle === "bike" && input.vehicleSubtype === "bicycle" ? config.bicycle : config.vehicles[input.vehicle] ?? config.vehicles.bike;
  const speedMultiplier = config.speedMultipliers[input.speed] ?? 1;
  const zoneSurcharge = input.zone?.toLowerCase().includes("ogun") ? config.ogunSurcharge : 0;
  const baseFare = vehicle.base + zoneSurcharge;
  const distanceFare = input.distanceKm * vehicle.perKm;
  const deliveryFee = Math.round(((baseFare + distanceFare) * speedMultiplier) / 50) * 50;
  const platformFee = input.vehicle === "bike" && input.vehicleSubtype === "bicycle" ? config.bicyclePlatformFee : config.platformFee;
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
  return DEFAULT_FARE_CONFIG.vehicles[vehicle]?.label ?? "Bike";
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

function clampNumber(value: unknown, min: number, max: number, fallback: number, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const factor = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round(number * factor) / factor));
}
