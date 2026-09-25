export const FAST_ERRAND_MINIMUM_CART_NGN = 1500;

export type FastErrandPricingBand = {
  id?: string;
  min_distance_exclusive_meters: number;
  max_distance_inclusive_meters: number;
  service_fee_ngn: number;
  sort_order?: number;
  is_active?: boolean;
};

export type FastErrandBandQuote = FastErrandPricingBand & { feeNgn: number };

export function moneyNgn(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

/** Bands are open at the lower edge and inclusive at the upper edge. */
export function findFastErrandBand(distanceMeters: number, bands: FastErrandPricingBand[]): FastErrandBandQuote | null {
  const distance = Math.round(Number(distanceMeters));
  if (!Number.isFinite(distance) || distance <= 0) return null;
  const band = bands
    .filter((entry) => entry.is_active !== false)
    .sort((a, b) => a.min_distance_exclusive_meters - b.min_distance_exclusive_meters || a.max_distance_inclusive_meters - b.max_distance_inclusive_meters)
    .find((entry) => distance > moneyNgn(entry.min_distance_exclusive_meters) && distance <= moneyNgn(entry.max_distance_inclusive_meters));
  return band ? { ...band, feeNgn: moneyNgn(band.service_fee_ngn) } : null;
}

export function validateFastErrandBands(bands: FastErrandPricingBand[], maximumDistanceMeters: number) {
  const active = bands.filter((entry) => entry.is_active !== false).sort((a, b) => a.min_distance_exclusive_meters - b.min_distance_exclusive_meters || a.max_distance_inclusive_meters - b.max_distance_inclusive_meters);
  let previousMaximum = 0;
  for (const band of active) {
    if (moneyNgn(band.min_distance_exclusive_meters) !== previousMaximum || moneyNgn(band.max_distance_inclusive_meters) <= previousMaximum || moneyNgn(band.service_fee_ngn) < 0) {
      return { valid: false as const, error: "Pricing bands must be contiguous, non-overlapping, and have valid fees." };
    }
    previousMaximum = moneyNgn(band.max_distance_inclusive_meters);
  }
  if (previousMaximum !== moneyNgn(maximumDistanceMeters)) return { valid: false as const, error: "Active pricing bands must cover the maximum distance exactly." };
  return { valid: true as const };
}

export function fastErrandDisplayDistanceKm(distanceMeters: number) {
  return Math.round((Math.max(0, Number(distanceMeters)) / 1000) * 100) / 100;
}

export function fastErrandMinimumProgress(goodsSubtotalNgn: number, minimumCartNgn = FAST_ERRAND_MINIMUM_CART_NGN) {
  return Math.max(0, moneyNgn(minimumCartNgn) - moneyNgn(goodsSubtotalNgn));
}
