export const currentLocationStorageKey = "fastfleet_current_location";
export const currentLocationUpdatedEvent = "fastfleet-current-location-updated";

export type StoredCurrentLocation = {
  address: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  updatedAt: string;
};

export function readStoredCurrentLocation(): StoredCurrentLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(currentLocationStorageKey) || "null") as StoredCurrentLocation | null;
    if (!parsed?.address || !Number.isFinite(parsed.latitude) || !Number.isFinite(parsed.longitude)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredCurrentLocation(location: StoredCurrentLocation) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(currentLocationStorageKey, JSON.stringify(location));
  window.dispatchEvent(new CustomEvent(currentLocationUpdatedEvent, { detail: location }));
}
