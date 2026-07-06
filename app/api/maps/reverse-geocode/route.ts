import { NextResponse } from "next/server";
import { googleRequestReferer } from "@/lib/maps/google-api";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.maps, name: "maps:reverse-geocode" });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return NextResponse.json({ error: "Latitude and longitude are required." }, { status: 400 });
  }

  if (!googleMapsKey) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 503 });
  }

  const params = new URLSearchParams({
    latlng: `${latitude},${longitude}`,
    key: googleMapsKey
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`, {
      headers: {
        Referer: googleRequestReferer(request)
      },
      next: { revalidate: 60 * 10 }
    });
    const payload = await response.json();

    if (!response.ok || payload.status !== "OK") {
      return NextResponse.json({ error: payload.error_message || payload.status || "Reverse geocoding failed." }, { status: 502 });
    }

    return NextResponse.json({
      address: payload.results?.[0]?.formatted_address || "",
      latitude,
      longitude
    });
  } catch {
    return NextResponse.json({ error: "Reverse geocoding service failed." }, { status: 502 });
  }
}
