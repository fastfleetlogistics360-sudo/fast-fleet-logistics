import { NextResponse } from "next/server";
import { createCustomerVehicleOptions } from "@/lib/customer-vehicle-options";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { businessPickupAddressFor, findClosedMarketplaceVendor, loadActiveLinkedBusiness, resolveMarketplaceBusinessLinks, type MarketplaceCheckoutItem } from "@/lib/marketplace-business-links";
import { configuredMarketplacePickupAddress, estimateMarketplaceCheckout, marketplacePickupAddress } from "@/lib/marketplace-pricing";
import { campusFeeMetadata, loadCampusProgram, resolveLecturerBenefit } from "@/lib/campus-program";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "marketplace:vehicle-options" });
    if (limited) return limited;
    const payload = await request.json().catch(() => ({})) as { kind?: "restaurant" | "shopping"; address?: unknown; items?: MarketplaceCheckoutItem[] };
    const items = Array.isArray(payload.items) ? payload.items : [];
    const address = sanitizeAddressText(String(payload.address || ""));
    if (!items.length || address.length < 6) return NextResponse.json({ error: "Add your items and delivery address to see rider options." }, { status: 400 });
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Live rider options are temporarily unavailable." }, { status: 503 });
    const closedVendor = await findClosedMarketplaceVendor(admin, payload.kind, items);
    if (closedVendor) return NextResponse.json({ error: `${closedVendor} is currently closed and cannot accept orders.` }, { status: 409 });
    const businessLinks = await resolveMarketplaceBusinessLinks(admin, payload.kind, items);
    if (businessLinks.linkedBusinessIds.length > 1 || businessLinks.hasLinkedItems && businessLinks.hasUnlinkedItems) return NextResponse.json({ error: "Checkout items must all belong to one registered marketplace business." }, { status: 400 });
    const marketplaceKind = payload.kind === "shopping" ? "shopping" : "restaurant";
    const resolvedItems = businessLinks.items;
    const business = await loadActiveLinkedBusiness(admin, businessLinks.linkedBusinessIds[0] || null);
    const pickupAddress = configuredMarketplacePickupAddress(resolvedItems) || (business ? businessPickupAddressFor(business, marketplacePickupAddress(resolvedItems, marketplaceKind)) : marketplacePickupAddress(resolvedItems, marketplaceKind));
    const [fareConfig, deliveryPolicy, campusProgram, supabase] = await Promise.all([loadFareConfig(), loadDeliveryPolicy(), loadCampusProgram(), createClient()]);
    const { data: { user } } = await supabase.auth.getUser();
    const availabilityOptions = (await createCustomerVehicleOptions({
      db: admin,
      fareConfig,
      input: { pickup: { address: pickupAddress }, dropoff: { address }, speed: "same_day", marketplaceKind, items: resolvedItems }
    })).filter((option) => option.id === "bicycle" || option.id === "motorcycle");
    const options = await Promise.all(availabilityOptions.map(async (availabilityOption) => {
      const vehicleOption = availabilityOption.id as "bicycle" | "motorcycle";
      const estimate = await estimateMarketplaceCheckout({ kind: marketplaceKind, items: resolvedItems, address, pickupAddress, fareConfig, deliveryPolicy, campusProgram, vehicleOption });
      const lecturerBenefit = await resolveLecturerBenefit({ program: campusProgram, userId: user?.id, address, deliveryFee: estimate.deliveryFee, platformFee: estimate.platformFee });
      const deliveryFee = lecturerBenefit.applied ? 0 : estimate.deliveryFee;
      const platformFee = lecturerBenefit.applied ? 0 : estimate.platformFee;
      return {
        id: availabilityOption.id,
        label: availabilityOption.label,
        description: availabilityOption.description,
        vehicle: "bike" as const,
        vehicleSubtype: estimate.vehicleSubtype,
        availability: availabilityOption.availability,
        itemsTotal: estimate.itemsTotal,
        deliveryFee,
        platformFee,
        total: estimate.itemsTotal + deliveryFee + platformFee,
        etaMinutes: estimate.etaMinutes,
        distanceKm: estimate.distanceKm,
        deliverySpeed: estimate.deliverySpeed,
        allowed: estimate.allowed,
        policyMessage: estimate.policyMessage,
        interstateDispatch: estimate.interstateDispatch,
        interstateDeliveryDays: estimate.interstateDeliveryDays,
        campus: { applied: estimate.campusAdjustment.applied, lecturerBenefit: lecturerBenefit.applied, message: lecturerBenefit.message, metadata: campusFeeMetadata({ program: campusProgram, adjustment: estimate.campusAdjustment, lecturerBenefit }) }
      };
    }));
    return NextResponse.json({ options });
  } catch {
    return NextResponse.json({ error: "Could not check marketplace rider options. Please try again." }, { status: 500 });
  }
}
