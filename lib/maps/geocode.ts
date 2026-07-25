export type GeocodedPoint = {
  latitude: number;
  longitude: number;
};

export async function geocodeAddress(address: string): Promise<GeocodedPoint | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
  const normalizedAddress = String(address || "").trim();
  if (!apiKey || !normalizedAddress) return null;

  const params = new URLSearchParams({ address: normalizedAddress, key: apiKey, region: "ng" });
  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      next: { revalidate: 300 }
    });
    const payload = await response.json().catch(() => ({}));
    const location = Array.isArray(payload.results) ? payload.results[0]?.geometry?.location : null;
    const latitude = Number(location?.lat);
    const longitude = Number(location?.lng);
    if (!response.ok || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { latitude, longitude };
  } catch {
    return null;
  }
}
