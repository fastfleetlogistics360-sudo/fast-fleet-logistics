import type { SupabaseClient } from "@supabase/supabase-js";
import { loadFareConfig } from "@/lib/fare-settings";
import { sanitizeAddressText } from "@/lib/location/address-formatting";
import { geocodeAddress } from "@/lib/maps/geocode";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { configuredMarketplacePickupAddress, estimateMarketplaceCheckout, marketplacePickupAddress } from "@/lib/marketplace-pricing";
import { businessPickupAddressFor, loadActiveLinkedBusiness, resolveMarketplaceBusinessLinks, type MarketplaceCheckoutItem } from "@/lib/marketplace-business-links";
import { loadDeliveryPolicy } from "@/lib/delivery-policy";
import { loadCampusProgram, resolveLecturerBenefit } from "@/lib/campus-program";
import { createPaymentIntent, markPaymentIntentInitializationFailed, markPaymentIntentPending, type PaymentIntentPurpose } from "@/lib/payments/payment-intents";
import { generatePaymentReference, initiateSquadPayment, paymentChannelsFor } from "@/lib/payments/squad";
import { accountTrackingHref } from "@/lib/tracking-links";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls, type ShoppingMall } from "@/lib/mall-menu";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey, type RestaurantKitchen } from "@/lib/restaurant-menu";
import { whatsappConfig } from "@/lib/whatsapp/config";

type JsonRecord = Record<string, unknown>;
type MarketplaceKind = "restaurant" | "shopping";
type Conversation = { whatsapp_phone: string; user_id?: string | null; state?: string | null; state_data?: JsonRecord | null };
type Customer = { id: string; email?: string | null; phone?: string | null; full_name?: string | null };

const dispatchVehicles = new Set(["bike", "car", "van"]);
const dispatchSpeeds = new Set(["standard", "same_day", "express", "priority", "interstate"]);

/**
 * The WhatsApp conversation is an alternative UI, not an alternative system:
 * checkout below writes the same deliveries/orders and payment intents as the app.
 */
export async function handleWhatsAppOrdering(input: {
  db: SupabaseClient;
  phone: string;
  customer: Customer;
  conversation: Conversation | null;
  text: string;
}) {
  const text = input.text.trim();
  const command = text.toUpperCase();
  const state = input.conversation?.state || "ready";
  const data = record(input.conversation?.state_data);

  if (command === "CANCEL" || command === "START OVER") {
    await save(input.db, input.phone, input.customer.id, "ready", {});
    return [welcome(firstName(input.customer.full_name))];
  }

  if (state === "ready") {
    if (command === "MENU") return [welcome(firstName(input.customer.full_name))];
    if (["MARKETPLACE", "SHOP", "FOOD"].includes(command)) return beginMarketplace(input, command);
    if (["DISPATCH", "DELIVERY"].includes(command)) return beginDispatch(input);
    return [welcome(firstName(input.customer.full_name))];
  }

  if (state.startsWith("marketplace_")) return handleMarketplace(input, state, data, text, command);
  if (state.startsWith("dispatch_")) return handleDispatch(input, state, data, text, command);

  await save(input.db, input.phone, input.customer.id, "ready", {});
  return [welcome(firstName(input.customer.full_name))];
}

async function beginMarketplace(input: { db: SupabaseClient; phone: string; customer: Customer }, command: string) {
  if (command === "FOOD") return chooseMarketplaceKind(input, "restaurant");
  if (command === "SHOP") return chooseMarketplaceKind(input, "shopping");
  await save(input.db, input.phone, input.customer.id, "marketplace_kind", { flow: "marketplace" });
  return ["Marketplace ordering\n\nReply FOOD for restaurant meals or SHOP for shopping items.\n\nReply CANCEL at any time to return to the main menu."];
}

async function chooseMarketplaceKind(input: { db: SupabaseClient; phone: string; customer: Customer }, kind: MarketplaceKind) {
  const catalog = await loadCatalog(input.db, kind);
  const vendors = vendorsFor(catalog, kind).filter((vendor) => vendor.open);
  if (!vendors.length) return ["There are no available marketplace vendors right now. Please try again later."];
  const selectable = vendors.slice(0, 9);
  await save(input.db, input.phone, input.customer.id, "marketplace_vendor", {
    flow: "marketplace", kind, vendorIds: selectable.map((vendor) => vendor.id)
  });
  return [
    `${kind === "restaurant" ? "Choose a restaurant" : "Choose a shopping store"}\n\n${selectable.map((vendor, index) => `${index + 1}. ${vendor.name} — ${vendor.area}`).join("\n")}\n\nReply with a number.`
  ];
}

async function handleMarketplace(
  input: { db: SupabaseClient; phone: string; customer: Customer },
  state: string,
  data: JsonRecord,
  text: string,
  command: string
) {
  const kind = data.kind === "shopping" ? "shopping" : "restaurant";
  if (state === "marketplace_kind") {
    if (["FOOD", "1"].includes(command)) return chooseMarketplaceKind(input, "restaurant");
    if (["SHOP", "SHOPPING", "2"].includes(command)) return chooseMarketplaceKind(input, "shopping");
    return ["Reply FOOD for restaurant meals or SHOP for shopping items."];
  }

  const catalog = await loadCatalog(input.db, kind);
  if (state === "marketplace_vendor") {
    const vendorIds = strings(data.vendorIds);
    const choice = Number(command);
    const vendor = Number.isInteger(choice) ? vendorsFor(catalog, kind).find((item) => item.id === vendorIds[choice - 1]) : null;
    if (!vendor || !vendor.open) return ["Please reply with a number from the store list."];
    await save(input.db, input.phone, input.customer.id, "marketplace_cart", { flow: "marketplace", kind, vendorId: vendor.id, cart: [] });
    return [productMenu(vendor, kind)];
  }

  const vendor = vendorsFor(catalog, kind).find((item) => item.id === string(data.vendorId));
  if (!vendor || !vendor.open) {
    await save(input.db, input.phone, input.customer.id, "marketplace_kind", { flow: "marketplace" });
    return ["That store is no longer available. Reply FOOD or SHOP to choose another option."];
  }
  const cart = cartFrom(data.cart, vendor);

  if (state === "marketplace_cart") {
    if (command === "MENU") return [productMenu(vendor, kind, cart)];
    if (command === "CHECKOUT") {
      if (!cart.length) return ["Your cart is empty. Reply MENU and add an item first."];
      await save(input.db, input.phone, input.customer.id, "marketplace_address", { ...data, cart });
      return ["Please reply with the full delivery address. You can also share a WhatsApp location and include a landmark in your next message."];
    }
    const change = parseCartChange(command);
    if (!change || !vendor.products[change.index - 1]) return ["Reply with an item number to add one, ADD <item number> <quantity>, REMOVE <item number>, MENU, or CHECKOUT."];
    const product = vendor.products[change.index - 1];
    const current = cart.find((item) => item.productId === product.id)?.quantity || 0;
    const nextQuantity = change.action === "remove" ? 0 : Math.min(20, current + change.quantity);
    const nextCart = cart.filter((item) => item.productId !== product.id);
    if (nextQuantity > 0) nextCart.push({ productId: product.id, quantity: nextQuantity });
    await save(input.db, input.phone, input.customer.id, "marketplace_cart", { ...data, cart: nextCart });
    return [cartSummary(vendor, nextCart)];
  }

  if (state === "marketplace_address") {
    const address = sanitizeAddressText(text);
    if (address.length < 6) return ["Please send a complete delivery address with a street, area, and landmark."];
    const quote = await quoteMarketplace(input.db, input.customer.id, kind, vendor, cart, address);
    if (!quote.allowed) return [quote.message || "This address is outside the marketplace delivery area. Please send another address or reply CANCEL."];
    await save(input.db, input.phone, input.customer.id, "marketplace_review", { ...data, cart, address });
    return [marketplaceReview(vendor, cart, address, quote.total, quote.deliveryFee, quote.platformFee, quote.interstate)];
  }

  if (state === "marketplace_review") {
    const paymentMethod = whatsappPaymentMethod(command);
    if (!paymentMethod) return ["Reply PAY CARD or PAY TRANSFER to create your secure checkout, or CANCEL to discard this order."];
    const address = string(data.address);
    if (!address || !cart.length) return ["This order draft has expired. Reply MARKETPLACE to start again."];
    try {
      const checkout = await createMarketplacePayment(input.db, input.customer, input.phone, kind, vendor, cart, address, paymentMethod);
      await save(input.db, input.phone, input.customer.id, "ready", {});
      return [`Your order ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter Squad confirms payment, your order will appear in the app’s Transaction History and we will update you here.`];
    } catch {
      return ["We could not create the secure marketplace checkout. Your cart has not been charged. Please reply PAY to try again."];
    }
  }
  return ["Reply MENU to view items, CHECKOUT to continue, or CANCEL to return to the main menu."];
}

async function beginDispatch(input: { db: SupabaseClient; phone: string; customer: Customer }) {
  await save(input.db, input.phone, input.customer.id, "dispatch_pickup", { flow: "dispatch" });
  return ["Dispatch booking\n\nPlease send the full pickup address, including area and a nearby landmark.\n\nReply CANCEL at any time to return to the main menu."];
}

async function handleDispatch(
  input: { db: SupabaseClient; phone: string; customer: Customer },
  state: string,
  data: JsonRecord,
  text: string,
  command: string
) {
  if (state === "dispatch_pickup") return captureAddress(input, data, text, "pickup");
  if (state === "dispatch_pickup_contact") {
    await save(input.db, input.phone, input.customer.id, "dispatch_dropoff", { ...data, pickupContact: text.slice(0, 160) });
    return ["Please send the full drop-off address, including area and landmark."];
  }
  if (state === "dispatch_dropoff") return captureAddress(input, data, text, "dropoff");
  if (state === "dispatch_dropoff_contact") {
    await save(input.db, input.phone, input.customer.id, "dispatch_parcel", { ...data, dropoffContact: text.slice(0, 160) });
    return ["What are you sending? Reply with a short description, for example: Documents, Food and grocery, Fragile item, or Retail parcel."];
  }
  if (state === "dispatch_parcel") {
    if (text.length < 2) return ["Please describe the item you are sending."];
    await save(input.db, input.phone, input.customer.id, "dispatch_vehicle", { ...data, parcel: text.slice(0, 120) });
    return ["Choose a vehicle: reply BIKE for small/light parcels, CAR for medium items, or VAN for bulky goods."];
  }
  if (state === "dispatch_vehicle") {
    const vehicle = command.toLowerCase();
    if (!dispatchVehicles.has(vehicle)) return ["Reply BIKE, CAR, or VAN."];
    await save(input.db, input.phone, input.customer.id, "dispatch_speed", { ...data, vehicle });
    return ["Choose speed: STANDARD, SAME_DAY, EXPRESS, PRIORITY, or INTERSTATE."];
  }
  if (state === "dispatch_speed") {
    const speed = command.toLowerCase();
    if (!dispatchSpeeds.has(speed)) return ["Reply STANDARD, SAME_DAY, EXPRESS, PRIORITY, or INTERSTATE."];
    try {
      const quote = await quoteDispatch(input.db, input.customer.id, { ...data, speed });
      await save(input.db, input.phone, input.customer.id, "dispatch_review", { ...data, speed });
      return [`Dispatch quote\n\nPickup: ${string(data.pickup)}\nDrop-off: ${string(data.dropoff)}\nVehicle: ${vehicleLabel(string(data.vehicle))}\nSpeed: ${speedLabel(speed)}\nEstimated arrival: ${quote.etaMinutes} min\nTotal: ₦${formatMoney(quote.total)}\n\nReply PAY CARD or PAY TRANSFER to continue securely, or CANCEL to discard.`];
    } catch {
      return ["We could not calculate a quote for that route. Please reply CANCEL and try again with clearer addresses."];
    }
  }
  if (state === "dispatch_review") {
    const paymentMethod = whatsappPaymentMethod(command);
    if (!paymentMethod) return ["Reply PAY CARD or PAY TRANSFER to create your secure checkout, or CANCEL to discard this booking."];
    try {
      const checkout = await createDispatchPayment(input.db, input.customer, input.phone, data, paymentMethod);
      await save(input.db, input.phone, input.customer.id, "ready", {});
      return [`Your dispatch booking ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter Squad confirms payment, the booking will appear in the app’s Transaction History and we will update you here.`];
    } catch {
      return ["We could not create the secure dispatch checkout. You have not been charged. Reply PAY to try again."];
    }
  }
  return ["Reply CANCEL to return to the main menu."];
}

async function captureAddress(input: { db: SupabaseClient; phone: string; customer: Customer }, data: JsonRecord, text: string, field: "pickup" | "dropoff") {
  const address = sanitizeAddressText(text);
  if (address.length < 6) return [`Please send a complete ${field === "pickup" ? "pickup" : "drop-off"} address with a street, area, and landmark.`];
  if (field === "pickup") {
    await save(input.db, input.phone, input.customer.id, "dispatch_pickup_contact", { ...data, pickup: address });
    return ["Who should the rider contact at pickup? Reply with their name and phone number."];
  }
  await save(input.db, input.phone, input.customer.id, "dispatch_dropoff_contact", { ...data, dropoff: address });
  return ["Who should receive the item? Reply with their name and phone number."];
}

type CatalogVendor = { id: string; name: string; area: string; address: string; open: boolean; products: Array<{ id: string; name: string; price: number; available: boolean }>; mallId?: string; mallName?: string };
type CartItem = { productId: string; quantity: number };

async function loadCatalog(db: SupabaseClient, kind: MarketplaceKind) {
  const key = kind === "shopping" ? mallMenuSettingsKey : restaurantMenuSettingsKey;
  const { data } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle<{ value?: unknown }>();
  return kind === "shopping" ? normalizeShoppingMalls(data?.value || defaultShoppingMalls) : normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens);
}

function vendorsFor(catalog: ShoppingMall[] | RestaurantKitchen[], kind: MarketplaceKind): CatalogVendor[] {
  if (kind === "restaurant") return (catalog as RestaurantKitchen[]).map((kitchen) => ({
    id: kitchen.id, name: kitchen.name, area: kitchen.area, address: kitchen.address, open: kitchen.operatingStatus !== "closed",
    products: kitchen.items.map((item) => ({ id: item.id, name: item.name, price: item.price, available: true }))
  }));
  return (catalog as ShoppingMall[]).flatMap((mall) => mall.stores.map((store) => ({
    id: store.id, name: store.name, area: mall.location || mall.name, address: store.pickupAddress || mall.location || mall.name, open: store.operatingStatus !== "closed", mallId: mall.id, mallName: mall.name,
    products: store.products.filter((product) => typeof product.price === "number").map((product) => ({ id: product.id, name: product.name, price: Number(product.price), available: product.available !== false }))
  }))).filter((vendor) => vendor.products.some((product) => product.available));
}

function cartFrom(value: unknown, vendor: CatalogVendor): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const productId = string(record(item).productId);
    const quantity = Math.min(20, Math.max(1, Number(record(item).quantity || 1)));
    return vendor.products.some((product) => product.id === productId && product.available) && Number.isFinite(quantity) ? [{ productId, quantity }] : [];
  });
}

function productMenu(vendor: CatalogVendor, kind: MarketplaceKind, cart: CartItem[] = []) {
  const products = vendor.products.filter((product) => product.available).slice(0, 20);
  return `${vendor.name}\n${kind === "shopping" ? vendor.area : vendor.address}\n\n${products.map((product, index) => `${index + 1}. ${product.name} — ₦${formatMoney(product.price)}`).join("\n")}\n\nReply with an item number to add one, or ADD <item number> <quantity>.\n${cart.length ? `${cartSummary(vendor, cart)}\n` : ""}Reply CHECKOUT when you are ready.`;
}

function cartSummary(vendor: CatalogVendor, cart: CartItem[]) {
  const lines = cart.flatMap((entry) => {
    const product = vendor.products.find((item) => item.id === entry.productId);
    return product ? [`${product.name} × ${entry.quantity} — ₦${formatMoney(product.price * entry.quantity)}`] : [];
  });
  const total = cart.reduce((sum, entry) => sum + (vendor.products.find((item) => item.id === entry.productId)?.price || 0) * entry.quantity, 0);
  return `Your cart\n${lines.join("\n")}\nItems subtotal: ₦${formatMoney(total)}`;
}

function parseCartChange(command: string) {
  const add = command.match(/^ADD\s+(\d+)(?:\s+(\d+))?$/);
  if (add) return { action: "add" as const, index: Number(add[1]), quantity: Math.max(1, Number(add[2] || 1)) };
  const remove = command.match(/^REMOVE\s+(\d+)$/);
  if (remove) return { action: "remove" as const, index: Number(remove[1]), quantity: 1 };
  if (/^\d+$/.test(command)) return { action: "add" as const, index: Number(command), quantity: 1 };
  return null;
}

async function quoteMarketplace(db: SupabaseClient, userId: string, kind: MarketplaceKind, vendor: CatalogVendor, cart: CartItem[], address: string) {
  const items = marketplaceItems(kind, vendor, cart);
  const [fareConfig, deliveryPolicy, campusProgram, links] = await Promise.all([loadFareConfig(), loadDeliveryPolicy(), loadCampusProgram(), resolveMarketplaceBusinessLinks(db, kind, items)]);
  const business = await loadActiveLinkedBusiness(db, links.linkedBusinessIds[0] || null);
  const pickupAddress = configuredMarketplacePickupAddress(links.items) || (business ? businessPickupAddressFor(business, marketplacePickupAddress(links.items, kind)) : vendor.address);
  const estimate = await estimateMarketplaceCheckout({ kind, items: links.items, address, pickupAddress, fareConfig, deliveryPolicy, campusProgram });
  const benefit = await resolveLecturerBenefit({ program: campusProgram, userId, address, deliveryFee: estimate.deliveryFee, platformFee: estimate.platformFee });
  return { allowed: estimate.allowed, message: estimate.policyMessage, total: estimate.itemsTotal + (benefit.applied ? 0 : estimate.deliveryFee) + (benefit.applied ? 0 : estimate.platformFee), deliveryFee: benefit.applied ? 0 : estimate.deliveryFee, platformFee: benefit.applied ? 0 : estimate.platformFee, interstate: estimate.interstateDispatch, estimate, links, business, pickupAddress };
}

function marketplaceReview(vendor: CatalogVendor, cart: CartItem[], address: string, total: number, deliveryFee: number, platformFee: number, interstate: boolean) {
  return `Order review\n\n${cartSummary(vendor, cart)}\nDelivery: ₦${formatMoney(deliveryFee)}\nService fee: ₦${formatMoney(platformFee)}\nTotal: ₦${formatMoney(total)}\nDeliver to: ${address}${interstate ? "\n\nThis is an interstate delivery; timing may take more than one day." : ""}\n\nReply PAY CARD or PAY TRANSFER to continue securely, or CANCEL to discard.`;
}

async function createMarketplacePayment(db: SupabaseClient, customer: Customer, phone: string, kind: MarketplaceKind, vendor: CatalogVendor, cart: CartItem[], address: string, paymentMethod: "card" | "transfer") {
  if (!customer.email?.includes("@")) throw new Error("Missing customer email");
  const quote = await quoteMarketplace(db, customer.id, kind, vendor, cart, address);
  if (!quote.allowed || quote.links.linkedBusinessIds.length > 1 || (quote.links.hasLinkedItems && quote.links.hasUnlinkedItems)) throw new Error("Invalid marketplace quote");
  const reference = generatePaymentReference("FFM");
  const now = new Date().toISOString();
  let target: { purpose: PaymentIntentPurpose; internalReference: string; deliveryId?: string; orderId?: string; code: string };
  if (quote.business) {
    const { data: order, error } = await db.from("orders").insert({
      order_code: reference, customer_id: customer.id, business_id: quote.business.user_id, business_profile_id: quote.business.id, marketplace_kind: kind,
      items: quote.links.items, customer_contact: phone, pickup_address: quote.pickupAddress, dropoff_address: address, package_type: kind === "shopping" ? "shopping items" : "food order",
      vehicle_type: quote.estimate.vehicle, vehicle_subtype: quote.estimate.vehicleSubtype, status: "pending", amount: quote.total, delivery_fee_ngn: quote.estimate.deliveryFee,
      platform_fee_ngn: quote.platformFee, distance_km: quote.estimate.distanceKm, eta_minutes: quote.estimate.etaMinutes, route_source: quote.estimate.routeSource,
      route_type: quote.estimate.routeType, payment_method: paymentMethod, payment_status: "pending", metadata: { source: "whatsapp_ordering", whatsapp_phone: phone, created_at: now }
    }).select("id, order_code").single<{ id: string; order_code: string }>();
    if (error || !order) throw error || new Error("Order insert failed");
    target = { purpose: "marketplace_business_order", internalReference: `order:${order.id}`, orderId: order.id, code: order.order_code };
  } else {
    const [pickupPoint, dropoffPoint] = await Promise.all([geocodeAddress(quote.pickupAddress), geocodeAddress(address)]);
    const { data: delivery, error } = await db.from("deliveries").insert({
      delivery_code: reference, customer_id: customer.id, pickup_address: quote.pickupAddress, pickup_latitude: pickupPoint?.latitude || null, pickup_longitude: pickupPoint?.longitude || null,
      dropoff_address: address, dropoff_latitude: dropoffPoint?.latitude || null, dropoff_longitude: dropoffPoint?.longitude || null, pickup_contact: vendor.name, dropoff_contact: phone,
      parcel_type: kind === "shopping" ? "shopping items" : "food order", vehicle_type: quote.estimate.vehicle, delivery_speed: quote.estimate.deliverySpeed, payment_method: paymentMethod, status: "pending_payment",
      price_ngn: quote.total, delivery_fee_ngn: quote.estimate.deliveryFee, platform_fee_ngn: quote.platformFee, distance_km: quote.estimate.distanceKm, eta_minutes: quote.estimate.etaMinutes,
      route_source: quote.estimate.routeSource, route_type: quote.estimate.routeType, route_duration_seconds: quote.estimate.durationSeconds, vehicle_subtype: quote.estimate.vehicleSubtype,
      metadata: { source: "whatsapp_ordering", kind, items: quote.links.items, whatsapp_phone: phone, payment_provider: "squad", provider_reference: reference, payment_choice: paymentMethod }
    }).select("id, delivery_code").single<{ id: string; delivery_code: string }>();
    if (error || !delivery) throw error || new Error("Delivery insert failed");
    target = { purpose: "marketplace_delivery_payment", internalReference: `delivery:${delivery.id}`, deliveryId: delivery.id, code: delivery.delivery_code };
  }
  let intent;
  try {
    intent = await createPaymentIntent(db, { reference, internalReference: target.internalReference, purpose: target.purpose, ownerUserId: customer.id, amountNgn: quote.total, deliveryId: target.deliveryId || null, orderId: target.orderId || null });
    const callback = new URL(target.orderId ? "/marketplace/callback" : "/marketplace/callback", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", target.code); callback.searchParams.set("returnTo", accountTrackingHref(target.code));
    const squad = await initiateSquadPayment({ amountNgn: quote.total, email: customer.email, reference, callbackUrl: callback.toString(), customerName: customer.full_name || null, channels: paymentChannelsFor(paymentMethod), metadata: { purpose: target.purpose, internal_reference: target.internalReference, source: "whatsapp_ordering" } });
    await markPaymentIntentPending(db, intent.id);
    return { code: target.code, authorizationUrl: squad.authorizationUrl };
  } catch (error) {
    if (intent) await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
    if (target?.orderId) await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", target.orderId);
    if (target?.deliveryId) await db.from("deliveries").update({ status: "cancelled" }).eq("id", target.deliveryId);
    throw error;
  }
}

async function quoteDispatch(db: SupabaseClient, userId: string, data: JsonRecord) {
  const pickup = string(data.pickup); const dropoff = string(data.dropoff); const vehicle = string(data.vehicle); const speed = string(data.speed);
  if (!pickup || !dropoff || !dispatchVehicles.has(vehicle) || !dispatchSpeeds.has(speed)) throw new Error("Invalid dispatch draft");
  const [fareConfig, campusProgram] = await Promise.all([loadFareConfig(), loadCampusProgram()]);
  const quote = await createDeliveryQuote({ pickup: { address: pickup }, dropoff: { address: dropoff }, vehicle: vehicle as "bike" | "car" | "van", speed: speed as "standard" | "same_day" | "express" | "priority" | "interstate", parcelType: string(data.parcel), fareConfig });
  const benefit = await resolveLecturerBenefit({ program: campusProgram, userId, address: pickup, deliveryFee: quote.fare.deliveryFee, platformFee: quote.fare.platformFee });
  return { ...quote, total: benefit.applied ? 0 : quote.fare.total };
}

async function createDispatchPayment(db: SupabaseClient, customer: Customer, phone: string, data: JsonRecord, paymentMethod: "card" | "transfer") {
  if (!customer.email?.includes("@")) throw new Error("Missing customer email");
  const quote = await quoteDispatch(db, customer.id, data);
  if (quote.total <= 0) throw new Error("Zero-value dispatch must be booked in app");
  const reference = generatePaymentReference("FFD");
  const pickup = string(data.pickup); const dropoff = string(data.dropoff);
  const [pickupPoint, dropoffPoint] = await Promise.all([geocodeAddress(pickup), geocodeAddress(dropoff)]);
  const code = `FF-${Date.now().toString().slice(-6)}-${Math.floor(10 + Math.random() * 90)}`;
  const { data: delivery, error } = await db.from("deliveries").insert({
    delivery_code: code, customer_id: customer.id, pickup_address: pickup, pickup_latitude: pickupPoint?.latitude || null, pickup_longitude: pickupPoint?.longitude || null,
    dropoff_address: dropoff, dropoff_latitude: dropoffPoint?.latitude || null, dropoff_longitude: dropoffPoint?.longitude || null,
    pickup_contact: string(data.pickupContact), dropoff_contact: string(data.dropoffContact), parcel_type: string(data.parcel), vehicle_type: string(data.vehicle), delivery_speed: string(data.speed),
    payment_method: paymentMethod, status: "pending_payment", price_ngn: quote.total, delivery_fee_ngn: quote.fare.deliveryFee, platform_fee_ngn: quote.fare.platformFee, distance_km: quote.distanceKm,
    eta_minutes: quote.etaMinutes, route_source: quote.routeSource, route_type: quote.routeType, route_duration_seconds: quote.durationSeconds, vehicle_subtype: quote.vehicleSubtype,
    metadata: { source: "whatsapp_ordering", whatsapp_phone: phone, payment_provider: "squad", provider_reference: reference, payment_choice: paymentMethod }
  }).select("id, delivery_code").single<{ id: string; delivery_code: string }>();
  if (error || !delivery) throw error || new Error("Delivery insert failed");
  let intent;
  try {
    intent = await createPaymentIntent(db, { reference, internalReference: `delivery:${delivery.id}`, purpose: "delivery_payment", ownerUserId: customer.id, amountNgn: quote.total, deliveryId: delivery.id });
    const callback = new URL("/delivery/callback", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", delivery.delivery_code); callback.searchParams.set("deliveryId", delivery.id); callback.searchParams.set("returnTo", accountTrackingHref(delivery.delivery_code));
    const squad = await initiateSquadPayment({ amountNgn: quote.total, email: customer.email, reference, callbackUrl: callback.toString(), customerName: customer.full_name || null, channels: paymentChannelsFor(paymentMethod), metadata: { purpose: "delivery_payment", delivery_code: delivery.delivery_code, source: "whatsapp_ordering" } });
    await markPaymentIntentPending(db, intent.id);
    return { code: delivery.delivery_code, authorizationUrl: squad.authorizationUrl };
  } catch (error) {
    if (intent) await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
    await db.from("deliveries").update({ status: "cancelled" }).eq("id", delivery.id);
    throw error;
  }
}

async function save(db: SupabaseClient, phone: string, userId: string, state: string, stateData: JsonRecord) {
  const { error } = await db.from("whatsapp_conversations").upsert({ whatsapp_phone: phone, user_id: userId, state, state_data: stateData, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "whatsapp_phone" });
  if (error) throw error;
}

function marketplaceItems(kind: MarketplaceKind, vendor: CatalogVendor, cart: CartItem[]): MarketplaceCheckoutItem[] {
  const items: MarketplaceCheckoutItem[] = [];
  for (const entry of cart) {
    const product = vendor.products.find((item) => item.id === entry.productId);
    if (!product || !product.available) continue;
    const base = { name: product.name, productName: product.name, productId: product.id, quantity: entry.quantity, price: product.price, subtotal: product.price * entry.quantity, store: vendor.name, storeId: vendor.id };
    if (kind === "shopping") items.push({ ...base, vendorId: vendor.id, vendorName: vendor.name, mallId: vendor.mallId, mallName: vendor.mallName, mallLocation: vendor.address, pickupAddress: vendor.address });
    else items.push({ ...base, storeAddress: vendor.address, pickupAddress: vendor.address });
  }
  return items;
}

function welcome(name: string) {
  return `Welcome, ${name}.\n\nReply MARKETPLACE to order food or shopping, or DISPATCH to book a delivery.\n\nReply CANCEL or MENU at any time to return here.`;
}

function formatMoney(value: number) { return Math.max(0, Math.round(value || 0)).toLocaleString("en-NG"); }
function firstName(value: string | null | undefined) { return value?.trim().split(/\s+/)[0] || "there"; }
function record(value: unknown): JsonRecord { return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {}; }
function string(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function strings(value: unknown) { return Array.isArray(value) ? value.map(string).filter(Boolean) : []; }
function vehicleLabel(value: string) { return value ? value[0].toUpperCase() + value.slice(1) : "Vehicle"; }
function speedLabel(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function whatsappPaymentMethod(command: string): "card" | "transfer" | null {
  if (["PAY", "PAY CARD", "YES", "CONFIRM"].includes(command)) return "card";
  if (command === "PAY TRANSFER") return "transfer";
  return null;
}
function siteUrl() { const url = whatsappConfig().siteUrl; if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not configured."); return url; }
