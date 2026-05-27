import { NextResponse } from "next/server";
import { googleRequestReferer } from "@/lib/maps/google-api";

const googleMapsKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
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
          radius: 50000
        }
      };
    }

    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: googleRequestReferer(request),
        "X-Goog-Api-Key": googleMapsKey,
        "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat"
      },
      body: JSON.stringify(body),
      next: { revalidate: 30 }
    });
    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: googlePlacesError(payload.error?.message) }, { status: 502 });
    }

    return NextResponse.json({
      predictions: (payload.suggestions || [])
        .map((suggestion: { placePrediction?: NewPlacePrediction }) => suggestion.placePrediction)
        .filter(Boolean)
        .slice(0, 6)
        .map((prediction: NewPlacePrediction) => ({
          placeId: prediction.placeId,
          description: prediction.text?.text || "",
          mainText: prediction.structuredFormat?.mainText?.text || prediction.text?.text || "",
          secondaryText: prediction.structuredFormat?.secondaryText?.text || ""
        }))
        .filter((prediction: { placeId?: string; description?: string }) => prediction.placeId && prediction.description)
    });
  } catch {
    return NextResponse.json({ error: "Address suggestion service failed." }, { status: 502 });
  }
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
