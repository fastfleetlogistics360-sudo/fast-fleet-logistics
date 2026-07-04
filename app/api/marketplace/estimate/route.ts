import { NextResponse } from "next/server";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { businessPickupAddressFor, loadActiveLinkedBusiness, resolveMarketplaceBusinessLinks } from "@/lib/marketplace-business-links";
import { estimateMarketplaceCheckout, marketplacePickupAddress, type MarketplacePricingItem } from "@/lib/marketplace-pricing";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const fareConfig = await loadFareConfig();
    const marketplaceKind = payload.kind === "shopping" ? "shopping" : "restaurant";
    const admin = createAdminClient();
    let quoteItems = items;
    let pickupAddress: string | null = null;
    if (admin) {
      const businessLinks = await resolveMarketplaceBusinessLinks(admin, payload.kind, items);
      if (businessLinks.linkedBusinessIds.length > 1) {
        return NextResponse.json({ error: "Checkout items from one registered business at a time." }, { status: 400 });
      }
      if (businessLinks.hasLinkedItems && businessLinks.hasUnlinkedItems) {
        return NextResponse.json({ error: "Checkout items must all belong to the same linked marketplace business." }, { status: 400 });
      }
      quoteItems = businessLinks.items;
      const business = await loadActiveLinkedBusiness(admin, businessLinks.linkedBusinessIds[0] || null);
      if (business) pickupAddress = businessPickupAddressFor(business, marketplacePickupAddress(quoteItems, marketplaceKind));
    }
    const estimate = await estimateMarketplaceCheckout({ kind: payload.kind, items: quoteItems, address, pickupAddress, fareConfig });

    return NextResponse.json({
      itemsTotal: estimate.itemsTotal,
      deliveryFee: estimate.deliveryFee,
      platformFee: estimate.platformFee,
      total: estimate.total,
      distanceKm: estimate.distanceKm,
      etaMinutes: estimate.etaMinutes,
      routeType: estimate.routeType,
      routeSource: estimate.routeSource,
      bicycleEligible: estimate.bicycleEligible,
      vehicleSubtype: estimate.vehicleSubtype
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not estimate marketplace delivery." }, { status: 500 });
  }
}
