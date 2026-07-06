import { NextResponse } from "next/server";
import { getGoogleRouteEstimate } from "@/lib/maps/route-distance";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.maps, name: "maps:distance" });
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const origin = searchParams.get("origin")?.trim();
  const destination = searchParams.get("destination")?.trim();

  if (!origin || !destination) {
    return NextResponse.json({ error: "Origin and destination are required." }, { status: 400 });
  }

  try {
    const route = await getGoogleRouteEstimate({
      origin: { address: origin },
      destination: { address: destination }
    });
    return NextResponse.json({
      distanceKm: route.distanceKm,
      durationText: route.durationText,
      durationSeconds: route.durationSeconds,
      source: route.source
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Distance service failed.";
    return NextResponse.json({ error: message }, { status: message.includes("API key") ? 503 : 502 });
  }
}
