import { NextResponse } from "next/server";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { geocodeAddress } from "@/lib/maps/geocode";
import {
  businessPickupAddressFor,
  findClosedMarketplaceVendor,
  loadActiveLinkedBusiness,
  resolveMarketplaceBusinessLinks,
  type MarketplaceCheckoutItem
} from "@/lib/marketplace-business-links";
import { configuredMarketplacePickupAddress, estimateMarketplaceCheckout, marketplacePickupAddress } from "@/lib/marketplace-pricing";
import { campusFeeMetadata, loadCampusProgram, resolveLecturerBenefit } from "@/lib/campus-program";
import { paymentCallbackOrigin } from "@/lib/payments/callback-url";
import { addPaymentReturnToken } from "@/lib/payments/payment-return";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountTrackingHref } from "@/lib/tracking-links";
import { createCustomerVehicleOptions, customerVehicleSelection } from "@/lib/customer-vehicle-options";
import { MarketplaceVendorResolutionError, resolveMarketplaceVendorForCheckout } from "@/lib/marketplace-vendors";
import { issueMarketplacePickupCode } from "@/lib/marketplace-pickup-confirmation";
import { mondayBreakfastPayable, reserveMondayFreeBreakfast } from "@/lib/promos/monday-free-breakfast";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { notifyEligibleRiders } from "@/lib/rider-delivery-opportunities";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before placing this order." }, { status: 401 });
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentCreate, name: "marketplace:checkout" });
    if (limited) return limited;

    const payload = (await request.json()) as {
      kind?: "restaurant" | "shopping";
      email?: string;
      phone?: string;
      address?: string;
      amount?: number;
      items?: MarketplaceCheckoutItem[];
      fees?: {
        platformFee?: number;
        deliveryFee?: number;
      };
      interstateConfirmed?: boolean;
      freshDeliveryConfirmed?: boolean;
      vehicleOption?: unknown;
      fulfilmentMethod?: "DELIVERY" | "PICKUP";
      mondayBreakfastRequested?: boolean;
      paymentMethod?: "card" | "wallet";
    };

    const items = Array.isArray(payload.items) ? payload.items : [];
    const address = sanitizeAddressText(payload.address || "");
    const fulfilmentMethod = payload.fulfilmentMethod === "PICKUP" ? "PICKUP" : "DELIVERY";
    const paymentMethod = payload.paymentMethod === "wallet" ? "wallet" : "card";

    if (!payload.email || !payload.email.includes("@")) {
      return NextResponse.json({ error: "Enter a valid email address for Squad checkout." }, { status: 400 });
    }
    if (!items.length) {
      return NextResponse.json({ error: "Add at least one item before checkout." }, { status: 400 });
    }
    if (fulfilmentMethod === "DELIVERY" && address.length < 6) {
      return NextResponse.json({ error: "Enter the delivery street address." }, { status: 400 });
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }
    const closedVendor = await findClosedMarketplaceVendor(admin, payload.kind, items);
    if (closedVendor) {
      return NextResponse.json({ error: `${closedVendor} is currently closed and cannot accept orders.` }, { status: 409 });
    }
    const businessLinks = await resolveMarketplaceBusinessLinks(admin, payload.kind, items);
    const marketplaceKind = payload.kind === "shopping" ? "shopping" : "restaurant";
    const selectedVehicle = customerVehicleSelection(payload.vehicleOption);
    if (fulfilmentMethod === "DELIVERY" && (!selectedVehicle || (selectedVehicle.id !== "bicycle" && selectedVehicle.id !== "motorcycle"))) {
      return NextResponse.json({ error: "Choose an available Bicycle or Bike rider option." }, { status: 400 });
    }
    const resolvedItems = businessLinks.items;
    let vendorResolution;
    try {
      vendorResolution = await resolveMarketplaceVendorForCheckout(admin, payload.kind, resolvedItems);
    } catch (error) {
      if (error instanceof MarketplaceVendorResolutionError) return NextResponse.json({ error: error.message }, { status: error.status });
      throw error;
    }
    const shoppingBranchStates = Array.from(new Set(resolvedItems.map((item) => String(item.vendorState || "").trim()).filter(Boolean)));
    if (marketplaceKind === "shopping" && shoppingBranchStates.length > 1) {
      return NextResponse.json({ error: "Checkout items must come from one vendor state branch at a time." }, { status: 400 });
    }
    // Menu identity is the authoritative mixed-vendor boundary. A shared
    // internal business profile must never merge two public vendors.
    const linkedBusinessId = vendorResolution.vendor.linked_business_profile_id || businessLinks.linkedBusinessIds[0] || null;
    const business = await loadActiveLinkedBusiness(admin, linkedBusinessId);
    const configuredPickup = configuredMarketplacePickupAddress(resolvedItems);
    const quotePickupAddress = configuredPickup || (business ? businessPickupAddressFor(business, marketplacePickupAddress(resolvedItems, marketplaceKind)) : null);
    if (!quotePickupAddress) {
      return NextResponse.json({ error: "This vendor has not configured a pickup address yet." }, { status: 409 });
    }
    const [fareConfig, deliveryPolicy, campusProgram] = await Promise.all([loadFareConfig(), loadDeliveryPolicy(), loadCampusProgram()]);
    const vehicleOption = selectedVehicle?.id === "bicycle" || selectedVehicle?.id === "motorcycle" ? selectedVehicle.id : undefined;
    // A collection is not a delivery route. In particular, never send the
    // vendor's address through route/geocoding resolution for PICKUP: doing so
    // can incorrectly ask the customer to select a pickup point they do not
    // control.
    const estimate = fulfilmentMethod === "PICKUP"
      ? {
          itemsTotal: resolvedItems.reduce((sum, item) => sum + Math.round(Number(item.subtotal || 0)), 0),
          pickupAddress: quotePickupAddress,
          pickupState: null,
          dropoffState: null,
          distanceKm: 0,
          etaMinutes: 0,
          durationSeconds: 0,
          routeSource: "pickup",
          routeType: "pickup",
          bicycleEligible: false,
          vehicleSubtype: null,
          vehicle: "bike" as const,
          deliverySpeed: "same_day" as const,
          allowed: true,
          policyMessage: null,
          requiresFreshDeliveryConfirmation: false,
          interstateDispatch: false,
          interstateDeliveryDays: null,
          deliveryFee: 0,
          platformFee: fareConfig.platformFee,
          campusAdjustment: { applied: false, campusZoneId: null, deliveryFee: 0, platformFee: fareConfig.platformFee, totalDiscount: 0, riderEarningNgn: 0, pricingBand: "normal" as const }
        }
      : await estimateMarketplaceCheckout({ kind: payload.kind, items: resolvedItems, address, pickupAddress: quotePickupAddress, fareConfig, deliveryPolicy, campusProgram, vehicleOption });
    const liveVehicleOption = fulfilmentMethod === "DELIVERY" ? (await createCustomerVehicleOptions({
      db: admin,
      fareConfig,
      input: { pickup: { address: quotePickupAddress || marketplacePickupAddress(resolvedItems, marketplaceKind) }, dropoff: { address }, speed: "same_day", marketplaceKind, items: resolvedItems }
    })).find((option) => option.id === selectedVehicle?.id) : null;
    if (fulfilmentMethod === "DELIVERY" && (!liveVehicleOption || liveVehicleOption.availability.status === "unavailable")) {
      return NextResponse.json({ error: "That rider option is no longer available. Choose another option and try again." }, { status: 409 });
    }
    const lecturerBenefit = await resolveLecturerBenefit({ program: campusProgram, userId: user.id, address, deliveryFee: estimate.deliveryFee, platformFee: estimate.platformFee });
    if (!estimate.allowed) {
      if (fulfilmentMethod === "DELIVERY") return NextResponse.json({ error: estimate.policyMessage || "This marketplace order cannot be delivered to that address." }, { status: 422 });
    }
    if (fulfilmentMethod === "DELIVERY" && estimate.requiresFreshDeliveryConfirmation && payload.freshDeliveryConfirmed !== true) {
      return NextResponse.json(
        {
          error: estimate.policyMessage || "Confirm this long fresh delivery before checkout.",
          requiresFreshDeliveryConfirmation: true
        },
        { status: 409 }
      );
    }
    if (fulfilmentMethod === "DELIVERY" && estimate.interstateDispatch && payload.interstateConfirmed !== true) {
      return NextResponse.json(
        {
          error: estimate.policyMessage || "Confirm the interstate delivery timing before checkout.",
          requiresInterstateConfirmation: true,
          interstateDeliveryDays: estimate.interstateDeliveryDays
        },
        { status: 409 }
      );
    }
    const platformFee = fulfilmentMethod === "PICKUP" ? fareConfig.platformFee : lecturerBenefit.applied ? 0 : estimate.platformFee;
    const deliveryFee = fulfilmentMethod === "PICKUP" ? 0 : lecturerBenefit.applied ? 0 : estimate.deliveryFee;
    let mondayBreakfastDiscount = 0;
    // The request flag affects presentation only. The database RPC below
    // independently verifies that this resolved vendor is a restaurant.
    const campaignOrderId = marketplaceKind === "restaurant" && payload.mondayBreakfastRequested === true ? crypto.randomUUID() : null;
    if (campaignOrderId) {
      const reservation = await reserveMondayFreeBreakfast({
        db: admin,
        vendorId: vendorResolution.vendor.id,
        customerId: user.id,
        orderId: campaignOrderId,
        foodSubtotalNgn: estimate.itemsTotal,
        idempotencyKey: `monday-breakfast:${campaignOrderId}`
      });
      mondayBreakfastDiscount = reservation.eligible ? reservation.subsidyNgn : 0;
    }
    const mondayBreakfastPrice = mondayBreakfastPayable({
      foodSubtotalNgn: estimate.itemsTotal,
      subsidyNgn: mondayBreakfastDiscount,
      platformFeeNgn: platformFee,
      deliveryFeeNgn: deliveryFee
    });
    const expectedAmount = mondayBreakfastPrice.totalNgn;
    const operationalDeliveryFee = fulfilmentMethod === "PICKUP" ? 0 : estimate.campusAdjustment.riderEarningNgn;
    const campusMetadata = campusFeeMetadata({ program: campusProgram, adjustment: estimate.campusAdjustment, lecturerBenefit });
    const campusRiderPriorityUntil = estimate.campusAdjustment.applied
      ? new Date(Date.now() + campusProgram.riderPriorityMinutes * 60_000).toISOString()
      : null;
    if (Number(payload.amount) !== expectedAmount) {
      return NextResponse.json({ error: "Checkout total changed. Refresh and try again." }, { status: 400 });
    }

    const reference = generatePaymentReference("FFM");
    const siteUrl = paymentCallbackOrigin(request);
    const callbackUrl = new URL(`${siteUrl}/marketplace/callback`);
    callbackUrl.searchParams.set("reference", reference);
    callbackUrl.searchParams.set("code", reference);
    callbackUrl.searchParams.set("returnTo", accountTrackingHref(reference));
    addPaymentReturnToken(callbackUrl, reference);
    const pickupAddress = estimate.pickupAddress;
    const configuredPickupItem = resolvedItems.find((item) => Number.isFinite(item.pickupLatitude) && Number.isFinite(item.pickupLongitude));
    const [pickupPoint, dropoffPoint] = await Promise.all([
      fulfilmentMethod === "PICKUP"
        ? Promise.resolve(null)
        : configuredPickupItem
          ? Promise.resolve({ latitude: Number(configuredPickupItem.pickupLatitude), longitude: Number(configuredPickupItem.pickupLongitude) })
          : geocodeAddress(pickupAddress),
      fulfilmentMethod === "DELIVERY" ? geocodeAddress(address) : Promise.resolve(null)
    ]);
    let paymentIntentTarget: { purpose: PaymentIntentPurpose; internalReference: string; deliveryId?: string; orderId?: string } | null = null;

    if (business || fulfilmentMethod === "PICKUP") {
      if (!business) return NextResponse.json({ error: "Pickup is currently available only from verified vendor accounts." }, { status: 409 });
      let createdOrderId: string | null = null;
      try {
        const { data: order, error: orderError } = await admin
          .from("orders")
          .insert({
            ...(campaignOrderId ? { id: campaignOrderId } : {}),
            order_code: reference,
            customer_id: user.id,
            business_id: business.user_id,
            business_profile_id: business.id,
            marketplace_kind: payload.kind || "restaurant",
            marketplace_vendor_id: vendorResolution.vendor.id,
            marketplace_vendor_branch_id: vendorResolution.branch.id,
            marketplace_vendor_snapshot: vendorResolution.snapshot,
            items: resolvedItems,
            customer_contact: payload.phone || payload.email,
            pickup_address: pickupAddress,
            dropoff_address: fulfilmentMethod === "PICKUP" ? pickupAddress : address,
            package_type: payload.kind === "shopping" ? "shopping items" : "food order",
            vehicle_type: fulfilmentMethod === "PICKUP" ? "bike" : estimate.vehicle,
            vehicle_subtype: fulfilmentMethod === "PICKUP" ? null : estimate.vehicleSubtype,
            status: "pending",
            amount: expectedAmount,
            delivery_fee_ngn: operationalDeliveryFee,
            platform_fee_ngn: platformFee,
            distance_km: estimate.distanceKm,
            eta_minutes: estimate.etaMinutes,
            route_source: estimate.routeSource,
            route_type: estimate.routeType,
            payment_method: paymentMethod,
            payment_status: "pending",
            fulfilment_method: fulfilmentMethod,
            metadata: {
              ...(fulfilmentMethod === "PICKUP" ? { pickup_instructions: "Collect from the verified vendor address after the vendor marks the order ready." } : {}),
              ...(mondayBreakfastDiscount ? { monday_free_breakfast: { food_subtotal_ngn: mondayBreakfastPrice.foodSubtotalNgn, subsidy_ngn: mondayBreakfastPrice.subsidyNgn, customer_food_amount_ngn: mondayBreakfastPrice.customerFoodAmountNgn, platform_fee_ngn: mondayBreakfastPrice.platformFeeNgn, delivery_fee_ngn: mondayBreakfastPrice.deliveryFeeNgn } } : {})
            }
          })
          .select("id, order_code")
          .single();
        if (orderError) throw orderError;
        createdOrderId = order.id;
        if (fulfilmentMethod === "PICKUP") {
          // `code` is only the transient plaintext needed to reveal the code
          // to the authenticated customer. Never send it to PostgREST: the
          // protected table stores only the digest and encrypted ciphertext.
          const { code: _pickupCode, ...confirmation } = issueMarketplacePickupCode(order.id);
          const { error: confirmationError } = await admin.from("marketplace_pickup_confirmations").insert({ order_id: order.id, ...confirmation });
          if (confirmationError) throw confirmationError;
        }
        paymentIntentTarget = {
          purpose: "marketplace_business_order",
          internalReference: `order:${order.id}`,
          orderId: order.id
        };

      } catch (error) {
        // No payment intent exists at this point.  Do not leave an unpaid,
        // non-actionable order behind when secure pickup-code initialization
        // fails (for example, after a partial schema rollout).
        if (createdOrderId) {
          await admin.from("orders").delete().eq("id", createdOrderId).eq("status", "pending").eq("payment_status", "pending");
          await admin.rpc("release_monday_free_breakfast", { target_order_id: createdOrderId, next_state: "cancelled" });
        }
        console.error("Marketplace business-order initialization failed", {
          reference,
          fulfilmentMethod,
          ...databaseErrorSummary(error)
        });
        return NextResponse.json({ error: `Could not create the business marketplace order. Reference: ${reference}` }, { status: 500 });
      }
    } else {
      try {
        // Managed marketplace vendors do not need a linked Business Account.
        // The customer has already been authenticated above, so this server
        // write avoids an unnecessary browser-session RLS dependency.
        const { data: delivery, error: deliveryError } = await admin.from("deliveries").insert({
          delivery_code: reference,
          customer_id: user.id,
          pickup_address: pickupAddress,
          pickup_latitude: pickupPoint?.latitude || null,
          pickup_longitude: pickupPoint?.longitude || null,
          dropoff_address: address,
          dropoff_latitude: dropoffPoint?.latitude || null,
          dropoff_longitude: dropoffPoint?.longitude || null,
          pickup_contact: payload.kind === "shopping" ? "Shopping vendor" : "Restaurant vendor",
          dropoff_contact: payload.phone || payload.email,
          parcel_type: payload.kind === "shopping" ? "shopping items" : "food order",
          vehicle_type: estimate.vehicle,
          delivery_speed: estimate.deliverySpeed,
          payment_method: paymentMethod,
          status: "pending_payment",
          price_ngn: expectedAmount,
          delivery_fee_ngn: operationalDeliveryFee,
          platform_fee_ngn: platformFee,
          distance_km: estimate.distanceKm,
          eta_minutes: estimate.etaMinutes,
          route_source: estimate.routeSource,
          route_type: estimate.routeType,
          route_duration_seconds: estimate.durationSeconds,
          vehicle_subtype: estimate.vehicleSubtype,
          metadata: {
            source: "fastfleet_marketplace",
            kind: payload.kind,
            marketplace_vendor_id: vendorResolution.vendor.id,
            marketplace_vendor_branch_id: vendorResolution.branch.id,
            marketplace_vendor_snapshot: vendorResolution.snapshot,
            items: resolvedItems,
            pickup_state: estimate.pickupState || null,
            dropoff_state: estimate.dropoffState || null,
            pickup_latitude: pickupPoint?.latitude || null,
            pickup_longitude: pickupPoint?.longitude || null,
            dropoff_latitude: dropoffPoint?.latitude || null,
            dropoff_longitude: dropoffPoint?.longitude || null,
            delivery_fee_ngn: operationalDeliveryFee,
            payable_delivery_fee_ngn: deliveryFee,
            platform_fee_ngn: platformFee,
            original_platform_fee_ngn: estimate.platformFee,
            ...campusMetadata,
            campus_rider_priority_until: campusRiderPriorityUntil,
            delivery_distance_km: estimate.distanceKm,
            route_source: estimate.routeSource,
            route_type: estimate.routeType,
            route_duration_seconds: estimate.durationSeconds,
            bicycle_eligible: estimate.bicycleEligible,
            vehicle_subtype: estimate.vehicleSubtype,
            customer_vehicle_option: selectedVehicle?.id || null,
            marketplace_vehicle: estimate.vehicle,
            interstate_dispatch: estimate.interstateDispatch,
            interstate_delivery_days: estimate.interstateDeliveryDays,
            payment_provider: paymentMethod === "wallet" ? "fastfleet_wallet" : "squad",
            provider_reference: reference
          }
        }).select("id").single();
        if (deliveryError) throw deliveryError;
        // Managed vendors may intentionally have no Business Account. Keep the
        // canonical delivery flow, while recording the Marketplace order and
        // immutable vendor identity independently of that account relationship.
        const { data: unmanagedOrder, error: unmanagedOrderError } = await admin.from("orders").insert({
          ...(campaignOrderId ? { id: campaignOrderId } : {}),
          order_code: reference,
          customer_id: user.id,
          delivery_id: delivery.id,
          marketplace_kind: payload.kind || "restaurant",
          marketplace_vendor_id: vendorResolution.vendor.id,
          marketplace_vendor_branch_id: vendorResolution.branch.id,
          marketplace_vendor_snapshot: vendorResolution.snapshot,
          items: resolvedItems,
          customer_contact: payload.phone || payload.email,
          pickup_address: pickupAddress,
          dropoff_address: address,
          package_type: payload.kind === "shopping" ? "shopping items" : "food order",
          vehicle_type: estimate.vehicle,
          vehicle_subtype: estimate.vehicleSubtype,
          status: "pending",
          amount: expectedAmount,
          delivery_fee_ngn: operationalDeliveryFee,
          platform_fee_ngn: platformFee,
          distance_km: estimate.distanceKm,
          eta_minutes: estimate.etaMinutes,
          route_source: estimate.routeSource,
          route_type: estimate.routeType,
          payment_method: paymentMethod,
          payment_status: "pending",
          metadata: mondayBreakfastDiscount ? { monday_free_breakfast: { food_subtotal_ngn: mondayBreakfastPrice.foodSubtotalNgn, subsidy_ngn: mondayBreakfastPrice.subsidyNgn, customer_food_amount_ngn: mondayBreakfastPrice.customerFoodAmountNgn, platform_fee_ngn: mondayBreakfastPrice.platformFeeNgn, delivery_fee_ngn: mondayBreakfastPrice.deliveryFeeNgn } } : {}
        }).select("id").single();
        if (unmanagedOrderError || !unmanagedOrder) {
          await admin.from("deliveries").delete().eq("id", delivery.id);
          throw unmanagedOrderError || new Error("Could not create marketplace order.");
        }
        paymentIntentTarget = {
          purpose: "marketplace_delivery_payment",
          internalReference: `delivery:${delivery.id}`,
          deliveryId: delivery.id,
          orderId: unmanagedOrder.id
        };
      } catch {
        return NextResponse.json({ error: "Could not create the marketplace delivery." }, { status: 500 });
      }
    }

    if (!paymentIntentTarget) {
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }

    if (paymentMethod === "wallet") {
      if (!paymentIntentTarget.orderId) return NextResponse.json({ error: "Wallet checkout requires a Marketplace order." }, { status: 409 });
      const { error: walletError } = await supabase.rpc("pay_marketplace_order_from_wallet", {
        target_order_id: paymentIntentTarget.orderId,
        next_metadata: { source: "marketplace_checkout", marketplace_kind: marketplaceKind, payment_reference: reference }
      });
      if (walletError) {
        await cancelMarketplacePaymentTarget(admin, paymentIntentTarget);
        return NextResponse.json({ error: `${walletError.message}. Top up your wallet or choose card instead.` }, { status: 400 });
      }
      try {
        const promotion = await admin.rpc("complete_monday_free_breakfast", { target_order_id: paymentIntentTarget.orderId });
        if (promotion.error) console.error("Marketplace wallet promotion completion failed", { orderId: paymentIntentTarget.orderId, code: promotion.error.code });
      } catch {
        // The paid order remains valid. Campaign completion can be retried
        // from its protected ledger path without reversing a wallet debit.
      }
      const { data: paidOrder } = await admin.from("orders")
        .select("id, order_code, business_id, delivery_id")
        .eq("id", paymentIntentTarget.orderId)
        .maybeSingle<{ id: string; order_code?: string | null; business_id?: string | null; delivery_id?: string | null }>();
      const orderCode = paidOrder?.order_code || reference;
      await Promise.allSettled([
        paidOrder?.business_id ? insertNotificationWithPush(admin, { user_id: paidOrder.business_id, title: "New paid marketplace order", body: `${orderCode} is paid and waiting for your team to prepare.`, type: "business_order_received", metadata: { order_id: paymentIntentTarget.orderId, order_code: orderCode, url: "/business/dashboard#marketplace-orders" } }) : Promise.resolve(),
        insertNotificationWithPush(admin, { user_id: user.id, title: "Marketplace payment confirmed", body: `${orderCode} has been sent to the business.`, type: "order_update", metadata: { order_id: paymentIntentTarget.orderId, order_code: orderCode, status: "received", url: accountTrackingHref(orderCode) } })
      ]);
      if (paidOrder?.delivery_id) {
        const { data: delivery } = await admin.from("deliveries").select("id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, distance_km, price_ngn, delivery_fee_ngn, vehicle_type, vehicle_subtype, metadata").eq("id", paidOrder.delivery_id).maybeSingle();
        if (delivery) await notifyEligibleRiders(admin, delivery, (await loadDeliveryPolicy()).rider).catch(() => undefined);
      }
      return NextResponse.json({ reference: orderCode, userId: user.id, vehicleSubtype: estimate.vehicleSubtype, vehicle: estimate.vehicle, interstateDispatch: estimate.interstateDispatch, businessOrder: Boolean(business), status: "received", paid: true, paymentMethod: "wallet" });
    }

    let paymentIntent;
    try {
      paymentIntent = await createPaymentIntent(admin, {
        reference,
        internalReference: paymentIntentTarget.internalReference,
        purpose: paymentIntentTarget.purpose,
        ownerUserId: user.id,
        amountNgn: expectedAmount,
        deliveryId: paymentIntentTarget.deliveryId || null,
        orderId: paymentIntentTarget.orderId || null
      });
    } catch {
      await cancelMarketplacePaymentTarget(admin, paymentIntentTarget);
      return NextResponse.json({ error: "Secure payment checkout is temporarily unavailable. Please try again." }, { status: 503 });
    }

    let squadCheckout;
    try {
      squadCheckout = await initiateSquadPayment({
        amountNgn: expectedAmount,
        email: payload.email,
        reference,
        callbackUrl: callbackUrl.toString(),
        customerName: payload.phone || payload.email,
        metadata: {
          purpose: paymentIntentTarget.purpose,
          internal_reference: paymentIntentTarget.internalReference
        }
      });
    } catch {
      await markPaymentIntentInitializationFailed(admin, paymentIntent.id).catch(() => undefined);
      await cancelMarketplacePaymentTarget(admin, paymentIntentTarget);
      return NextResponse.json({ error: "Payment checkout could not start. Please try again." }, { status: 502 });
    }

    await markPaymentIntentPending(admin, paymentIntent.id).catch(() => undefined);

    return NextResponse.json({
      reference: squadCheckout.reference,
      authorizationUrl: squadCheckout.authorizationUrl,
      userId: user.id,
      vehicleSubtype: estimate.vehicleSubtype,
      vehicle: estimate.vehicle,
      interstateDispatch: estimate.interstateDispatch,
      businessOrder: Boolean(business),
      status: business ? "pending" : "pending_payment"
    });
  } catch {
    return NextResponse.json({ error: "Marketplace checkout failed." }, { status: 500 });
  }
}

/**
 * PostgREST failures are often plain objects. Keep their useful database
 * classification in private server logs, while the browser receives only the
 * non-sensitive checkout reference needed to locate that log entry.
 */
function databaseErrorSummary(error: unknown) {
  if (error instanceof Error) return { message: error.message.slice(0, 300) };
  if (!error || typeof error !== "object") return { message: String(error).slice(0, 300) };
  const source = error as Record<string, unknown>;
  const value = (key: "code" | "message" | "hint") => typeof source[key] === "string" ? source[key].slice(0, 300) : undefined;
  return { code: value("code"), message: value("message") || "Unknown database error", hint: value("hint") };
}

async function cancelMarketplacePaymentTarget(
  db: NonNullable<ReturnType<typeof createAdminClient>> | Awaited<ReturnType<typeof createClient>>,
  target: { purpose: PaymentIntentPurpose; internalReference: string; deliveryId?: string; orderId?: string }
) {
  if (target.orderId) {
    await db.from("orders").update({ status: "cancelled", payment_status: "failed", updated_at: new Date().toISOString() }).eq("id", target.orderId);
    await db.rpc("release_monday_free_breakfast", { target_order_id: target.orderId, next_state: "cancelled" });
    return;
  }
  if (target.deliveryId) {
    await db.from("deliveries").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", target.deliveryId);
  }
}
