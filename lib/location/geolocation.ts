export type LocationPermissionState = PermissionState | "unsupported" | "unknown";

export async function getLocationPermissionState(): Promise<LocationPermissionState> {
  if (typeof navigator === "undefined") return "unsupported";
  if (!("permissions" in navigator) || !navigator.permissions?.query) return "unknown";

  try {
    const permission = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return permission.state;
  } catch {
    return "unknown";
  }
}

export function assertGeolocationReady() {
  if (typeof window !== "undefined" && window.isSecureContext === false) {
    throw new Error("Location requires HTTPS or localhost. Open FastFleet from the secure app URL.");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location access is not enabled on this device.");
  }
}

export async function requestCurrentPosition(options: PositionOptions = {}) {
  assertGeolocationReady();

  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 15000,
      ...options
    });
  });
}

export function geolocationErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? Number((error as GeolocationPositionError).code) : null;

  if (code === 1) {
    return "Location permission was denied. Enable location access for FastFleet to share live movement.";
  }
  if (code === 2) {
    return "Your device could not find a reliable location. Check GPS/network signal and retry.";
  }
  if (code === 3) {
    return "Location lookup timed out. FastFleet will retry shortly.";
  }
  return error instanceof Error ? error.message : "Could not read your location. Retrying shortly.";
}
