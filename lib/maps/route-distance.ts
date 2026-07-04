export type RouteLocation = {
  address?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type GoogleRouteEstimate = {
  distanceKm: number;
  durationSeconds: number;
  durationText: string;
  source: "google-routes";
};

const routesUrl = "https://routes.googleapis.com/directions/v2:computeRoutes";

export function googleRoutesApiKey() {
  return process.env.GOOGLE_ROUTES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
}

export async function getGoogleRouteEstimate({
  origin,
  destination
}: {
  origin: RouteLocation;
  destination: RouteLocation;
}): Promise<GoogleRouteEstimate> {
  const apiKey = googleRoutesApiKey();
  if (!apiKey) throw new Error("Google Maps API key is not configured.");

  const body = {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    languageCode: "en-NG",
    regionCode: "NG",
    units: "METRIC"
  };

  const response = await fetch(routesUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters"
    },
    body: JSON.stringify(body),
    next: { revalidate: 60 }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(readGoogleError(payload) || "Google route distance could not be completed.");
  }

  const route = Array.isArray(payload.routes) ? payload.routes[0] : null;
  const distanceMeters = Number(route?.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new Error("Google could not calculate a route distance for those addresses.");
  }

  const durationSeconds = parseGoogleDurationSeconds(route?.duration);
  return {
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationSeconds,
    durationText: formatDurationText(durationSeconds),
    source: "google-routes"
  };
}

function toWaypoint(location: RouteLocation) {
  if (location.placeId) return { placeId: String(location.placeId).trim() };

  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      location: {
        latLng: {
          latitude,
          longitude
        }
      }
    };
  }

  const address = String(location.address || "").trim();
  if (!address) throw new Error("A route address, place ID, or coordinates are required.");
  return { address };
}

function parseGoogleDurationSeconds(value: unknown) {
  if (typeof value !== "string") return 0;
  const match = value.match(/^(\d+(?:\.\d+)?)s$/);
  return match ? Math.round(Number(match[1])) : 0;
}

function formatDurationText(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours} hr ${remaining} min` : `${hours} hr`;
}

function readGoogleError(payload: unknown) {
  const error = payload && typeof payload === "object" ? (payload as { error?: { message?: unknown } }).error : null;
  return typeof error?.message === "string" ? error.message : "";
}
