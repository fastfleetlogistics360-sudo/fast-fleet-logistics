import { NextResponse } from "next/server";
import { googleRequestReferer } from "@/lib/maps/google-api";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const googleMapsKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.maps, name: "maps:address-autocomplete" });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const input = searchParams.get("input")?.trim() || "";
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));

  if (input.length < 3) {
    return NextResponse.json({ predictions: [] });
  }

  if (!googleMapsKey) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 503 });
  }

  try {
    const predictions = await fetchNewPlacePredictions(input, latitude, longitude, request);
    if (predictions.length) return NextResponse.json({ predictions });
  } catch {
    // The legacy endpoint below keeps autocomplete working when Places API (New) is not enabled for the key.
  }

  try {
    return NextResponse.json({ predictions: await fetchLegacyPlacePredictions(input, latitude, longitude, request) });
  } catch {
    return NextResponse.json({ error: "Address suggestion service failed." }, { status: 502 });
  }
}

async function fetchNewPlacePredictions(input: string, latitude: number, longitude: number, request: Request) {
  const body: Record<string, unknown> = {
    input,
    includedRegionCodes: ["ng"],
    languageCode: "en",
    includedPrimaryTypes: ["street_address", "premise", "route", "subpremise"]
  };

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    body.locationBias = {
      circle: {
        center: { latitude, longitude },
        radius: 80000
      }
    };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Referer: googleRequestReferer(request),
      "X-Goog-Api-Key": googleMapsKey || "",
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
    },
    body: JSON.stringify(body),
    next: { revalidate: 30 }
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(googlePlacesError(payload.error?.message));
  }

  return (payload.suggestions || [])
    .map((suggestion: { placePrediction?: NewPlacePrediction }) => suggestion.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map((prediction: NewPlacePrediction) => ({
      placeId: prediction.placeId,
      description: prediction.text?.text || "",
      mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
      secondaryText: prediction.structuredFormat?.secondaryText?.text || ""
    }))
    .filter((prediction: { placeId?: string; description?: string }) => prediction.placeId && prediction.description);
}

async function fetchLegacyPlacePredictions(input: string, latitude: number, longitude: number, request: Request) {
  const params = new URLSearchParams({
    input,
    key: googleMapsKey || "",
    components: "country:ng",
    types: "address",
    language: "en"
  });

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    params.set("location", `${latitude},${longitude}`);
    params.set("radius", "80000");
  }

  const response = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?${params.toString()}`, {
    headers: { Referer: googleRequestReferer(request) },
    next: { revalidate: 30 }
  });
  const payload = (await response.json()) as LegacyPlacesPayload;
  if (!response.ok || (payload.status && !["OK", "ZERO_RESULTS"].includes(payload.status))) {
    throw new Error(payload.error_message || "Legacy address suggestions failed.");
  }

  return (payload.predictions || [])
    .slice(0, 6)
    .map((prediction) => ({
      placeId: prediction.place_id,
      description: prediction.description || "",
      mainText: prediction.structured_formatting?.main_text || prediction.description || "",
      secondaryText: prediction.structured_formatting?.secondary_text || ""
    }))
    .filter((prediction) => prediction.placeId && prediction.description);
}

function googlePlacesError(message?: string) {
  if (message?.toLowerCase().includes("blocked")) {
    return "Google Places API (New) is blocked for this key. Enable Places API (New) or set GOOGLE_PLACES_API_KEY to a server key that allows Places autocomplete.";
  }
  return message || "Address suggestions failed.";
}

type NewPlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: {
    mainText?: { text?: string };
    secondaryText?: { text?: string };
  };
};

type LegacyPlacesPayload = {
  status?: string;
  error_message?: string;
  predictions?: Array<{
    place_id?: string;
    description?: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
  }>;
};
