import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { resolveFastErrandQuote, FastErrandQuoteError, type FastErrandRequestedItem } from "@/lib/fast-errands-service-areas";
import { createAdminClient } from "@/lib/supabase/admin";

/** Compatibility response for older clients. New clients use /quote. */
export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "fast-errands:vehicle-options" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { items?: FastErrandRequestedItem[]; address?: unknown };
    const address = sanitizeAddressText(String(payload.address || ""));
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "FastErrand is temporarily unavailable." }, { status: 503 });
    const quote = await resolveFastErrandQuote({ db, items: Array.isArray(payload.items) ? payload.items : [], address });
    return NextResponse.json({ itemsTotal: quote.goodsSubtotalNgn, options: quote.vehicleOptions.map((option) => ({ id: option.id, label: option.label, description: option.description, vehicle: option.vehicle, vehicleSubtype: option.vehicleSubtype, availability: option.availability, deliveryFee: quote.serviceFeeNgn, platformFee: 0, total: quote.customerTotalNgn, etaMinutes: quote.etaMinutes, distanceKm: quote.displayDistanceKm })) });
  } catch (error) {
    if (error instanceof FastErrandQuoteError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    return NextResponse.json({ error: "Could not check FastErrand rider options. Please try again." }, { status: 500 });
  }
}
