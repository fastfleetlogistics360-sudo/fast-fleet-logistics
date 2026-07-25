import { DEFAULT_FARE_CONFIG, normalizeFareConfig } from "@/lib/fare";
import { createAdminClient } from "@/lib/supabase/admin";

const siteControlsSettingsKey = "admin_site_controls";

export type DeliveryPolicy = {
  rider: {
    crossBorderPickupRadiusKm: number;
    locationFreshnessMinutes: number;
    bicycleMaxRouteKm: number;
  };
  marketplace: {
    freshFoodMaxRouteKm: number;
    interstateDeliveryDays: number;
  };
};

export const DEFAULT_DELIVERY_POLICY: DeliveryPolicy = {
  rider: {
    crossBorderPickupRadiusKm: 10,
    locationFreshnessMinutes: 30,
    bicycleMaxRouteKm: DEFAULT_FARE_CONFIG.bicycleMaxDistanceKm
  },
  marketplace: {
    freshFoodMaxRouteKm: 30,
    interstateDeliveryDays: 2
  }
};

export function normalizeDeliveryPolicy(value: unknown, fareConfig: unknown = DEFAULT_FARE_CONFIG): DeliveryPolicy {
  const input = (value || {}) as {
    rider?: Record<string, unknown>;
    marketplace?: Record<string, unknown>;
  };
  const rider = input.rider || {};
  const marketplace = input.marketplace || {};
  const normalizedFareConfig = normalizeFareConfig(fareConfig);

  return {
    rider: {
      crossBorderPickupRadiusKm: clampNumber(rider.cross_border_pickup_radius_km ?? rider.crossBorderPickupRadiusKm, 1, 50, DEFAULT_DELIVERY_POLICY.rider.crossBorderPickupRadiusKm),
      locationFreshnessMinutes: clampNumber(rider.location_freshness_minutes ?? rider.locationFreshnessMinutes, 10, 60, DEFAULT_DELIVERY_POLICY.rider.locationFreshnessMinutes),
      bicycleMaxRouteKm: normalizedFareConfig.bicycleMaxDistanceKm
    },
    marketplace: {
      freshFoodMaxRouteKm: clampNumber(marketplace.fresh_food_max_route_km ?? marketplace.freshFoodMaxRouteKm, 5, 300, DEFAULT_DELIVERY_POLICY.marketplace.freshFoodMaxRouteKm),
      interstateDeliveryDays: clampNumber(marketplace.interstate_delivery_days ?? marketplace.interstateDeliveryDays, 1, 14, DEFAULT_DELIVERY_POLICY.marketplace.interstateDeliveryDays)
    }
  };
}

export function serializeDeliveryPolicy(policy: DeliveryPolicy) {
  return {
    rider: {
      cross_border_pickup_radius_km: policy.rider.crossBorderPickupRadiusKm,
      location_freshness_minutes: policy.rider.locationFreshnessMinutes
    },
    marketplace: {
      fresh_food_max_route_km: policy.marketplace.freshFoodMaxRouteKm,
      interstate_delivery_days: policy.marketplace.interstateDeliveryDays
    }
  };
}

export async function loadDeliveryPolicy(): Promise<DeliveryPolicy> {
  const supabase = createAdminClient();
  if (!supabase) return DEFAULT_DELIVERY_POLICY;

  const { data } = await supabase.from("platform_settings").select("value").eq("key", siteControlsSettingsKey).maybeSingle();
  const value = (data?.value || {}) as { delivery_policy?: unknown; fare_config?: unknown };
  return normalizeDeliveryPolicy(value.delivery_policy, value.fare_config);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
