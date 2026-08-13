import { NextResponse } from "next/server";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { businessPickupAddressFor, loadActiveLinkedBusiness, resolveMarketplaceBusinessLinks } from "@/lib/marketplace-business-links";
import { configuredMarketplacePickupAddress, estimateMarketplaceCheckout, marketplacePickupAddress, type MarketplacePricingItem } from "@/lib/marketplace-pricing";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { campusFeeMetadata, loadCampusProgram, resolveLecturerBenefit } from "@/lib/campus-program";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "marketplace:estimate" });
    if (limited) return limited;

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

    const [fareConfig, deliveryPolicy, campusProgram, supabase] = await Promise.all([loadFareConfig(), loadDeliveryPolicy(), loadCampusProgram(), createClient()]);
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
      const configuredPickup = configuredMarketplacePickupAddress(quoteItems);
      if (configuredPickup) pickupAddress = configuredPickup;
      else if (business) pickupAddress = businessPickupAddressFor(business, marketplacePickupAddress(quoteItems, marketplaceKind));
    }
    const estimate = await estimateMarketplaceCheckout({ kind: payload.kind, items: quoteItems, address, pickupAddress, fareConfig, deliveryPolicy, campusProgram });
    const { data: { user } } = await supabase.auth.getUser();
    const lecturerBenefit = await resolveLecturerBenefit({
      program: campusProgram,
      userId: user?.id,
      address,
      deliveryFee: estimate.deliveryFee,
      platformFee: estimate.platformFee
    });
    const deliveryFee = lecturerBenefit.applied ? 0 : estimate.deliveryFee;
    const platformFee = lecturerBenefit.applied ? 0 : estimate.platformFee;

    return NextResponse.json({
      itemsTotal: estimate.itemsTotal,
      deliveryFee,
      platformFee,
      total: estimate.itemsTotal + deliveryFee + platformFee,
      distanceKm: estimate.distanceKm,
      etaMinutes: estimate.etaMinutes,
      routeType: estimate.routeType,
      routeSource: estimate.routeSource,
      bicycleEligible: estimate.bicycleEligible,
      vehicleSubtype: estimate.vehicleSubtype,
      vehicle: estimate.vehicle,
      deliverySpeed: estimate.deliverySpeed,
      allowed: estimate.allowed,
      policyMessage: estimate.policyMessage,
      interstateDispatch: estimate.interstateDispatch,
      interstateDeliveryDays: estimate.interstateDeliveryDays,
      campus: {
        applied: estimate.campusAdjustment.applied,
        pricingBand: estimate.campusAdjustment.pricingBand,
        lecturerBenefit: lecturerBenefit.applied,
        message: lecturerBenefit.message,
        metadata: campusFeeMetadata({ program: campusProgram, adjustment: estimate.campusAdjustment, lecturerBenefit })
      }
    });
  } catch {
    return NextResponse.json({ error: "Could not estimate marketplace delivery. Please try again." }, { status: 500 });
  }
}
