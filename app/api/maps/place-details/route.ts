import { NextResponse } from "next/server";
import { googleRequestReferer } from "@/lib/maps/google-api";

const googleMapsKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() || "";

  if (!placeId) {
    return NextResponse.json({ error: "Place id is required." }, { status: 400 });
  }

  if (!googleMapsKey) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 503 });
  }

  try {
    const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: {
        Referer: googleRequestReferer(request),
        "X-Goog-Api-Key": googleMapsKey,
        "X-Goog-FieldMask": "formattedAddress,location,displayName"
      },
      next: { revalidate: 60 * 60 * 24 }
    });
    const payload = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: googlePlacesError(payload.error?.message) }, { status: 502 });
    }

    return NextResponse.json({
      address: payload.formattedAddress || payload.displayName?.text || "",
      latitude: payload.location?.latitude ?? null,
      longitude: payload.location?.longitude ?? null
    });
  } catch {
    return NextResponse.json({ error: "Place details service failed." }, { status: 502 });
  }
}

function googlePlacesError(message?: string) {
  if (message?.toLowerCase().includes("blocked")) {
    return "Google Places API (New) is blocked for this key. Enable Places API (New) or set GOOGLE_PLACES_API_KEY to a server key that allows Place Details.";
  }
  return message || "Place details failed.";
}
