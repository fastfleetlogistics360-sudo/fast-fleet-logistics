import { AddressResolutionError, resolveAddressForRouting } from "@/lib/maps/address-resolution";

export type RouteLocation = {
  address?: string | null;
  placeId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type GoogleRouteEstimate = {
  /** Never round this value before a pricing or eligibility decision. */
  distanceMeters: number;
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

  const fallbackOrigin = retryWithAddress ? withoutPlaceId(origin) : origin;
  const fallbackDestination = retryWithAddress ? withoutPlaceId(destination) : destination;
  if (finalPayload.error) return retryWithResolvedAddress(apiKey, fallbackOrigin, fallbackDestination, readGoogleError(finalPayload));

  const route = Array.isArray(finalPayload.routes) ? finalPayload.routes[0] : null;
  const distanceMeters = Number(route?.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return retryWithResolvedAddress(apiKey, fallbackOrigin, fallbackDestination, "Google could not calculate a route distance for those addresses.");

  const durationSeconds = parseGoogleDurationSeconds(route?.duration);
  return {
    distanceMeters: Math.round(distanceMeters),
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationSeconds,
    durationText: formatDurationText(durationSeconds),
    source: "google-routes"
  };
}

async function retryWithResolvedAddress(apiKey: string, origin: RouteLocation, destination: RouteLocation, originalError: string): Promise<GoogleRouteEstimate> {
  const originResolved = await resolveRouteLocation(origin, "pickup");
  const destinationResolved = await resolveRouteLocation(destination, "drop-off");
  const payload = await requestGoogleRoute(apiKey, routeRequestBody(originResolved, destinationResolved));
  if (payload.error) throw new Error(readGoogleError(payload) || originalError || "Google could not calculate a route distance for those addresses.");
  const route = Array.isArray(payload.routes) ? payload.routes[0] : null;
  const distanceMeters = Number(route?.distanceMeters);
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error("Google could not calculate a route distance for those addresses.");
  const durationSeconds = parseGoogleDurationSeconds(route?.duration);
  return { distanceMeters: Math.round(distanceMeters), distanceKm: Math.round((distanceMeters / 1000) * 10) / 10, durationSeconds, durationText: formatDurationText(durationSeconds), source: "google-routes" };
}

async function resolveRouteLocation(location: RouteLocation, label: "pickup" | "drop-off"): Promise<RouteLocation> {
  if (hasPlaceId(location) || hasCoordinates(location)) return location;
  try {
    const resolved = await resolveAddressForRouting(String(location.address || ""));
    return { address: resolved.formattedAddress, placeId: resolved.placeId, latitude: resolved.latitude, longitude: resolved.longitude };
  } catch (error) {
    if (error instanceof AddressResolutionError) {
      throw new AddressResolutionError(error.kind, error.kind === "ambiguous" ? `Choose the correct ${label} location to continue.` : `We could not identify the ${label} address. Please add a clearer street address or landmark.`, error.candidates, label === "pickup" ? "pickup" : "dropoff");
    }
    throw error;
  }
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
  if (hasCoordinates(location)) {
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

function hasCoordinates(location: RouteLocation) {
  return location.latitude != null
    && location.longitude != null
    && Number.isFinite(Number(location.latitude))
    && Number.isFinite(Number(location.longitude));
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
