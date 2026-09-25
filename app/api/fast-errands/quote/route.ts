import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { resolveFastErrandQuote, FastErrandQuoteError, type FastErrandRequestedItem } from "@/lib/fast-errands-service-areas";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "fast-errands:quote" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { items?: FastErrandRequestedItem[]; address?: unknown };
    const address = sanitizeAddressText(String(payload.address || ""));
    if (address.length < 6) return NextResponse.json({ error: "Enter a delivery address to receive a FastErrand quote." }, { status: 400 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrand is temporarily unavailable." }, { status: 503 });
    const quote = await resolveFastErrandQuote({ db, items: Array.isArray(payload.items) ? payload.items : [], address });
    return NextResponse.json({ quote: safeQuote(quote, true) });
  } catch (error) {
    if (error instanceof FastErrandQuoteError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not calculate a FastErrand quote. Please try again." }, { status: 500 });
  }
}

function safeQuote(quote: Awaited<ReturnType<typeof resolveFastErrandQuote>>, withVehicles = false) {
  return { fingerprint: quote.fingerprint, goodsSubtotalNgn: quote.goodsSubtotalNgn, minimumCartNgn: quote.minimumCartNgn, amountToMinimumNgn: quote.amountToMinimumNgn, serviceFeeNgn: quote.serviceFeeNgn, customerTotalNgn: quote.customerTotalNgn, roadDistanceMeters: quote.roadDistanceMeters, displayDistanceKm: quote.displayDistanceKm, etaMinutes: quote.etaMinutes, ...(withVehicles ? { vehicleOptions: quote.vehicleOptions.map((option) => ({ id: option.id, label: option.label, description: option.description, vehicle: option.vehicle, vehicleSubtype: option.vehicleSubtype, availability: option.availability })) } : {}) };
}
