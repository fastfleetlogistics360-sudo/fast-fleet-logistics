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
    throw new Error("Location requires HTTPS or localhost. Open Fast Fleets 360 from the secure app URL.");
  }
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    throw new Error("Location access is not enabled on this device.");
  }
}

export async function requestCurrentPosition(options: PositionOptions = {}) {
  assertGeolocationReady();

  const primaryOptions: PositionOptions = {
    enableHighAccuracy: true,
    maximumAge: 5000,
    timeout: 15000,
    ...options
  };

  try {
    return await readBrowserPosition(primaryOptions);
  } catch (error) {
    if (!shouldRetryWithNetworkLocation(error, primaryOptions)) throw error;
    return readBrowserPosition({
      enableHighAccuracy: false,
      maximumAge: Math.max(Number(primaryOptions.maximumAge || 0), 600000),
      timeout: Math.max(Number(primaryOptions.timeout || 0), 20000)
    });
  }
}

function readBrowserPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      ...options
    });
  });
}

function geolocationErrorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error ? Number((error as GeolocationPositionError).code) : null;
}

export function isGeolocationPermissionDenied(error: unknown) {
  return geolocationErrorCode(error) === 1;
}

export function isGeolocationLookupUnavailable(error: unknown) {
  const code = geolocationErrorCode(error);
  return code === 2 || code === 3;
}

function shouldRetryWithNetworkLocation(error: unknown, options: PositionOptions) {
  return isGeolocationLookupUnavailable(error) && options.enableHighAccuracy !== false;
}

export function geolocationErrorMessage(error: unknown) {
  const code = geolocationErrorCode(error);

  if (code === 1) {
    return "Location permission was denied. Enable location access for Fast Fleets 360 to share live movement.";
  }
  if (code === 2) {
    return "Your browser could not calculate your location right now. On Mac, keep Location Services enabled for this browser, or continue and type addresses manually.";
  }
  if (code === 3) {
    return "Location lookup timed out. Fast Fleets 360 will retry shortly.";
  }
  return error instanceof Error ? error.message : "Could not read your location. Retrying shortly.";
}
