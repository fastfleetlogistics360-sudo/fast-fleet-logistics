import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { extractNigerianState } from "@/lib/location/state-matching";

export type ResolvedRouteAddress = {
  originalAddress: string;
  formattedAddress: string;
  placeId: string;
  latitude: number;
  longitude: number;
  state: string;
};

export type AddressResolutionCandidate = Pick<ResolvedRouteAddress, "formattedAddress" | "placeId" | "state"> & { latitude?: number; longitude?: number };

export class AddressResolutionError extends Error {
  readonly kind: "ambiguous" | "unresolved";
  readonly candidates: AddressResolutionCandidate[];
  readonly field: "pickup" | "dropoff" | null;

  constructor(kind: "ambiguous" | "unresolved", message: string, candidates: AddressResolutionCandidate[] = [], field: "pickup" | "dropoff" | null = null) {
    super(message);
    this.name = "AddressResolutionError";
    this.kind = kind;
    this.candidates = candidates;
    this.field = field;
  }
}

export function addressResolutionPayload(error: AddressResolutionError) {
  return {
    error: error.message,
    code: error.kind === "ambiguous" ? "ADDRESS_AMBIGUOUS" : "ADDRESS_UNRESOLVED",
    addressField: error.field,
    candidates: error.candidates
  };
}

const autocompleteUrl = "https://places.googleapis.com/v1/places:autocomplete";

/**
 * Resolves a customer-entered address only after normal Routes address routing
 * has failed. A result is auto-used only when Google returns one candidate;
 * multiple credible candidates always require the customer to choose.
 */
export async function resolveAddressForRouting(address: string): Promise<ResolvedRouteAddress> {
  const originalAddress = sanitizeAddressText(address);
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || "";
  if (!apiKey || originalAddress.length < 4) {
    throw new AddressResolutionError("unresolved", "Please enter a clearer street address or nearby landmark.");
  }

  const candidates = await findCandidates(originalAddress, apiKey);
  if (!candidates.length) {
    throw new AddressResolutionError("unresolved", "We could not find that address. Please add a street, estate, landmark, or nearby business.");
  }
  if (candidates.length > 1) {
    throw new AddressResolutionError("ambiguous", "We found a few possible locations. Please choose the one you mean.", candidates);
  }

  const candidate = candidates[0];
  if (!Number.isFinite(candidate.latitude) || !Number.isFinite(candidate.longitude)) {
    throw new AddressResolutionError("unresolved", "We could not verify that address. Please choose a location or add a clearer landmark.");
  }
  return { ...candidate, latitude: Number(candidate.latitude), longitude: Number(candidate.longitude), originalAddress };
}

async function findCandidates(input: string, apiKey: string): Promise<AddressResolutionCandidate[]> {
  try {
    const response = await fetch(autocompleteUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
      },
      body: JSON.stringify({
        input,
        includedRegionCodes: ["ng"],
        // A fallback must also recognise well-known estates, businesses, and
        // landmarks. The normal address autocomplete remains address-only.
        languageCode: "en"
      }),
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return findGeocodeCandidates(input, apiKey);
    const predictions = (payload.suggestions || [])
      .map((entry: { placePrediction?: { placeId?: string; text?: { text?: string } } }) => entry.placePrediction)
      .filter((prediction: { placeId?: string; text?: { text?: string } } | undefined): prediction is { placeId: string; text?: { text?: string } } => Boolean(prediction?.placeId && prediction.text?.text))
      .slice(0, 3);

    // Do not spend three Place Details requests merely to tell the customer
    // that Google found several plausible locations. Their explicit choice
    // will fetch details through the existing autocomplete component.
    if (predictions.length > 1) return predictions.map((prediction: { placeId: string; text?: { text?: string } }) => ({
      placeId: prediction.placeId,
      formattedAddress: sanitizeAddressText(prediction.text?.text || ""),
      state: extractNigerianState(prediction.text?.text || "")
    }));
    const candidate = predictions[0] ? await loadCandidate(predictions[0].placeId, predictions[0].text?.text || "", apiKey) : null;
    return candidate ? [candidate] : findGeocodeCandidates(input, apiKey);
  } catch {
    return findGeocodeCandidates(input, apiKey);
  }
}

async function findGeocodeCandidates(input: string, apiKey: string): Promise<AddressResolutionCandidate[]> {
  try {
    const params = new URLSearchParams({ address: input, key: apiKey, region: "ng" });
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.status !== "OK" || !Array.isArray(payload.results)) return [];
    return payload.results
      .filter((result: { partial_match?: boolean }) => result.partial_match !== true)
      .slice(0, 3)
      .map((result: { formatted_address?: string; place_id?: string; geometry?: { location?: { lat?: number; lng?: number } }; address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }> }) => {
        const latitude = Number(result.geometry?.location?.lat);
        const longitude = Number(result.geometry?.location?.lng);
        const formattedAddress = sanitizeAddressText(result.formatted_address || "");
        const stateComponent = result.address_components?.find((part) => part.types?.includes("administrative_area_level_1"));
        if (!result.place_id || !formattedAddress || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return { placeId: result.place_id, formattedAddress, latitude, longitude, state: extractNigerianState(stateComponent?.long_name || stateComponent?.short_name || formattedAddress) };
      })
      .filter((candidate: AddressResolutionCandidate | null): candidate is AddressResolutionCandidate => Boolean(candidate));
  } catch {
    return [];
  }
}

async function loadCandidate(placeId: string, predictionText: string, apiKey: string): Promise<AddressResolutionCandidate | null> {
  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "formattedAddress,location,addressComponents"
      },
      cache: "no-store"
    });
    const payload = await response.json().catch(() => ({}));
    const latitude = Number(payload.location?.latitude);
    const longitude = Number(payload.location?.longitude);
    const formattedAddress = sanitizeAddressText(payload.formattedAddress || predictionText);
    if (!response.ok || !formattedAddress || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const stateComponent = Array.isArray(payload.addressComponents)
      ? payload.addressComponents.find((part: { types?: string[] }) => part.types?.includes("administrative_area_level_1"))
      : null;
    return {
      placeId,
      formattedAddress,
      latitude,
      longitude,
      state: extractNigerianState(stateComponent?.longText || stateComponent?.shortText || formattedAddress)
    };
  } catch {
    return null;
  }
}
