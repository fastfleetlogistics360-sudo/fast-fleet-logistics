import { NextResponse } from "next/server";
import { getGoogleRouteEstimate } from "@/lib/maps/route-distance";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.mapsRouteEstimate);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin")?.trim();
  const destination = searchParams.get("destination")?.trim();

  if (!origin || !destination) {
    return NextResponse.json({ error: "Origin and destination are required." }, { status: 400 });
  }

  try {
    const originCoordinates = parseCoordinates(origin);
    const destinationCoordinates = parseCoordinates(destination);
    const route = await getGoogleRouteEstimate({
      origin: originCoordinates || { address: origin },
      destination: destinationCoordinates || { address: destination }
    });
    return NextResponse.json({
      distanceKm: route.distanceKm,
      durationText: route.durationText,
      durationSeconds: route.durationSeconds,
      source: route.source
    });
  } catch {
    return NextResponse.json({ error: "Distance service is temporarily unavailable. Please try again." }, { status: 503 });
  }
}

function parseCoordinates(value: string) {
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) return null;
  if (Math.abs(parts[0]) > 90 || Math.abs(parts[1]) > 180) return null;
  return { latitude: parts[0], longitude: parts[1] };
}
