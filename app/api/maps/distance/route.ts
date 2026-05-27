import { NextResponse } from "next/server";
import { googleRequestReferer } from "@/lib/maps/google-api";

const googleMapsKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin")?.trim();
  const destination = searchParams.get("destination")?.trim();

  if (!origin || !destination) {
    return NextResponse.json({ error: "Origin and destination are required." }, { status: 400 });
  }

  if (!googleMapsKey) {
    return NextResponse.json({ error: "Google Maps API key is not configured." }, { status: 503 });
  }

  const params = new URLSearchParams({
    origins: origin,
    destinations: destination,
    mode: "driving",
    units: "metric",
    key: googleMapsKey
  });

  try {
    const response = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params.toString()}`, {
      headers: {
        Referer: googleRequestReferer(request)
      },
      next: { revalidate: 60 }
    });

    if (!response.ok) {
      return NextResponse.json({ error: "Route distance estimate could not be completed." }, { status: response.status });
    }

    const payload = await response.json();
    const element = payload?.rows?.[0]?.elements?.[0];

    if (payload?.status !== "OK" || element?.status !== "OK" || typeof element?.distance?.value !== "number") {
      return NextResponse.json({ error: "Could not calculate route distance." }, { status: 422 });
    }

    return NextResponse.json({
      distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
      durationText: element.duration?.text || null,
      source: "google-distance-matrix"
    });
  } catch {
    return NextResponse.json({ error: "Distance service failed." }, { status: 502 });
  }
}
