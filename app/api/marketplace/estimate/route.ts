import { NextResponse } from "next/server";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { estimateMarketplaceCheckout, type MarketplacePricingItem } from "@/lib/marketplace-pricing";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      kind?: "restaurant" | "shopping";
      address?: string;
      items?: MarketplacePricingItem[];
    };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const address = sanitizeAddressText(String(payload.address || ""));

    if (!items.length) {
      return NextResponse.json({ error: "Add at least one item before estimating delivery." }, { status: 400 });
    }
    if (address.length < 6) {
      return NextResponse.json({ error: "Enter the delivery street address." }, { status: 400 });
    }

    const estimate = estimateMarketplaceCheckout({ kind: payload.kind, items, address });

    return NextResponse.json({
      itemsTotal: estimate.itemsTotal,
      deliveryFee: estimate.deliveryFee,
      platformFee: estimate.platformFee,
      total: estimate.total,
      distanceKm: estimate.distanceKm,
      etaMinutes: estimate.etaMinutes
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not estimate marketplace delivery." }, { status: 500 });
  }
}
