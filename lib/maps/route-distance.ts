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
  return process.env.GOOGLE_ROUTES_API_KEY || "";
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

  const body = routeRequestBody(origin, destination);
  const payload = await requestGoogleRoute(apiKey, body);
  const retryWithAddress =
    isInvalidPlaceIdError(payload) &&
    ((hasUsableAddress(origin) && hasPlaceId(origin)) || (hasUsableAddress(destination) && hasPlaceId(destination)));
  const finalPayload = retryWithAddress ? await requestGoogleRoute(apiKey, routeRequestBody(withoutPlaceId(origin), withoutPlaceId(destination))) : payload;

  if (finalPayload.error) {
    throw new Error(readGoogleError(finalPayload) || "Google route distance could not be completed.");
  }

  const route = Array.isArray(finalPayload.routes) ? finalPayload.routes[0] : null;
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

function routeRequestBody(origin: RouteLocation, destination: RouteLocation) {
  return {
    origin: toWaypoint(origin),
    destination: toWaypoint(destination),
    travelMode: "DRIVE",
    routingPreference: "TRAFFIC_AWARE",
    computeAlternativeRoutes: false,
    languageCode: "en-NG",
    regionCode: "NG",
    units: "METRIC"
  };
}

async function requestGoogleRoute(apiKey: string, body: Record<string, unknown>) {
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
  return response.ok ? payload : { ...payload, error: payload.error || { message: "Google route distance could not be completed." } };
}

function toWaypoint(location: RouteLocation) {
  const placeId = cleanPlaceId(location.placeId);
  if (placeId) return { placeId };

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

function cleanPlaceId(value: unknown) {
  const placeId = String(value || "").trim();
  if (!placeId || placeId.startsWith("local-address-")) return "";
  return placeId;
}

function hasPlaceId(location: RouteLocation) {
  return Boolean(cleanPlaceId(location.placeId));
}

function hasUsableAddress(location: RouteLocation) {
  return Boolean(String(location.address || "").trim());
}

function withoutPlaceId(location: RouteLocation): RouteLocation {
  return { ...location, placeId: null };
}

function isInvalidPlaceIdError(payload: unknown) {
  const message = readGoogleError(payload).toLowerCase();
  return message.includes("place id") && message.includes("invalid");
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
