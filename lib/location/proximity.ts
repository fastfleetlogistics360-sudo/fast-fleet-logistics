export type CoordinatePoint = {
  latitude: number;
  longitude: number;
};

export const crossStatePickupRadiusKm = 10;
export const bicycleCrossStateRouteMaxKm = 10;
export const riderLocationFreshMinutes = 10;
export const riderLocationFreshMs = riderLocationFreshMinutes * 60 * 1000;

export function coordinatePoint(latitude: unknown, longitude: unknown): CoordinatePoint | null {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { latitude: lat, longitude: lng };
}

export function haversineKm(from: CoordinatePoint, to: CoordinatePoint) {
  const earthKm = 6371;
  const dLat = degreesToRadians(to.latitude - from.latitude);
  const dLng = degreesToRadians(to.longitude - from.longitude);
  const lat1 = degreesToRadians(from.latitude);
  const lat2 = degreesToRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isFreshLocation(updatedAt: string | null | undefined, now = Date.now()) {
  const timestamp = updatedAt ? Date.parse(updatedAt) : NaN;
  return Number.isFinite(timestamp) && now - timestamp <= riderLocationFreshMs;
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}
