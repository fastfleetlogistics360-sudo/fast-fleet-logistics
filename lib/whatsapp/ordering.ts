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
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls, type ShoppingMall } from "@/lib/mall-menu";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey, type RestaurantKitchen } from "@/lib/restaurant-menu";
import { loadFastErrandsCatalog, type FastErrandsCategory } from "@/lib/fast-errands-catalog";
import { FastErrandQuoteError, resolveFastErrandQuote, type FastErrandRequestedItem } from "@/lib/fast-errands-service-areas";
import { buildFastErrandV2Snapshot } from "@/lib/fast-errands-order-snapshot";
import { customerVehicleSelection } from "@/lib/customer-vehicle-options";
import { resolveStorageQuote, StorageQuoteError, storageDuration } from "@/lib/storage-facility";
import { whatsappConfig } from "@/lib/whatsapp/config";
import { assertWhatsAppPaymentReturnConfigured, whatsappPaymentReturnToken } from "@/lib/whatsapp/payment-return";

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
    if (["1", "MARKETPLACE", "SHOP", "FOOD"].includes(command)) return beginMarketplace(input, command);
    if (["2", "DISPATCH", "DELIVERY"].includes(command)) return beginDispatch(input);
    if (["3", "FASTERRANDS", "FAST ERRANDS", "ERRANDS"].includes(command)) return beginFastErrands(input);
    if (["4", "STORAGE", "STORAGE FACILITY", "STORAGE BOOKING"].includes(command)) return beginStorageBooking(input);
    return [welcome(firstName(input.customer.full_name))];
  }

  if (state.startsWith("marketplace_")) return handleMarketplace(input, state, data, text, command);
  if (state.startsWith("dispatch_")) return handleDispatch(input, state, data, text, command);
  if (state.startsWith("fast_errands_")) return handleFastErrands(input, state, data, text, command);
  if (state.startsWith("storage_")) return handleStorageBooking(input, state, data, text, command);

  await save(input.db, input.phone, input.customer.id, "ready", {});
  return [welcome(firstName(input.customer.full_name))];
}

async function beginMarketplace(input: { db: SupabaseClient; phone: string; customer: Customer }, command: string) {
  if (command === "FOOD") return chooseMarketplaceKind(input, "restaurant");
  if (command === "SHOP") return chooseMarketplaceKind(input, "shopping");
  await save(input.db, input.phone, input.customer.id, "marketplace_kind", { flow: "marketplace" });
  return ["Marketplace ordering\n\nReply 1 for restaurant meals or 2 for shopping items.\n\nReply CANCEL at any time to return to the main menu."];
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
    return ["Reply 1 for restaurant meals or 2 for shopping items."];
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
    const product = change ? availableProducts(vendor)[change.index - 1] : null;
    if (!change || !product) return ["Reply with an item number to add one. Reply MORE <number> to add another, REMOVE <number> to remove an item, MENU to see the list, or CHECKOUT when ready."];
    const current = cart.find((item) => item.productId === product.id)?.quantity || 0;
    const nextQuantity = change.action === "remove" ? 0 : Math.min(20, current + change.quantity);
    const nextCart = cart.filter((item) => item.productId !== product.id);
    if (nextQuantity > 0) nextCart.push({ productId: product.id, quantity: nextQuantity });
    await save(input.db, input.phone, input.customer.id, "marketplace_cart", { ...data, cart: nextCart });
    return [`${cartSummary(vendor, nextCart)}\n\nReply another item number to add one, MORE <number> to add another, REMOVE <number> to remove an item, or CHECKOUT when ready.`];
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
      return [`Your order ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter payment, you will return to this WhatsApp chat. We will confirm your order and send every update here.`];
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
      return [`Your dispatch booking ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter payment, you will return to this WhatsApp chat. We will confirm your booking and send every update here.`];
    } catch {
      return ["We could not create the secure dispatch checkout. You have not been charged. Reply PAY to try again."];
    }
  }
  return ["Reply CANCEL to return to the main menu."];
}

async function beginFastErrands(input: { db: SupabaseClient; phone: string; customer: Customer }) {
  const catalog = await loadFastErrandsCatalog();
  const categories = catalog.filter((category) => category.is_active && category.items.some((item) => item.is_active));
  if (!categories.length) return ["FastErrands is unavailable right now. Please try another Fast Fleets service shortly."];
  await save(input.db, input.phone, input.customer.id, "fast_errands_category", { flow: "fast_errands", cart: [], categoryIds: categories.slice(0, 9).map((category) => category.id) });
  return [fastErrandCategoryMenu(categories)];
}

async function handleFastErrands(
  input: { db: SupabaseClient; phone: string; customer: Customer },
  state: string,
  data: JsonRecord,
  text: string,
  command: string
) {
  const catalog = await loadFastErrandsCatalog();
  const categories = catalog.filter((category) => category.is_active && category.items.some((item) => item.is_active));
  if (!categories.length) return ["FastErrands is unavailable right now. Please try another Fast Fleets service shortly."];
  const cart = fastErrandCartFrom(data.cart, catalog);

  if (state === "fast_errands_category") {
    const categoryIds = strings(data.categoryIds);
    const choice = Number(command);
    const category = Number.isInteger(choice) ? categories.find((item) => item.id === categoryIds[choice - 1]) : null;
    if (!category) return ["Reply with a number from the FastErrands category list."];
    await save(input.db, input.phone, input.customer.id, "fast_errands_cart", { flow: "fast_errands", cart, categoryId: category.id });
    return [fastErrandItemMenu(category, cart)];
  }

  if (state === "fast_errands_cart") {
    const category = categories.find((item) => item.id === string(data.categoryId));
    if (!category) return beginFastErrands(input);
    if (command === "CATEGORIES") {
      await save(input.db, input.phone, input.customer.id, "fast_errands_category", { flow: "fast_errands", cart, categoryIds: categories.slice(0, 9).map((item) => item.id) });
      return [fastErrandCategoryMenu(categories, cart)];
    }
    if (command === "MENU") return [fastErrandItemMenu(category, cart)];
    if (command === "CHECKOUT") {
      if (!cart.length) return ["Your FastErrands cart is empty. Reply MENU and add an item first."];
      await save(input.db, input.phone, input.customer.id, "fast_errands_address", { flow: "fast_errands", cart });
      return ["Please reply with the full delivery address, including area and a landmark."];
    }
    const change = parseCartChange(command);
    const product = change ? category.items.filter((item) => item.is_active).slice(0, 20)[change.index - 1] : null;
    if (!change || !product) return ["Reply with an item number to add one. Reply ADD <number> <quantity> for more, REMOVE <number> to remove an item, CATEGORIES to switch categories, or CHECKOUT when ready."];
    const current = cart.find((item) => item.itemId === product.id)?.quantity || 0;
    const nextQuantity = change.action === "remove" ? 0 : Math.min(25, current + change.quantity);
    const nextCart = cart.filter((item) => item.itemId !== product.id);
    if (nextQuantity) nextCart.push({ itemId: product.id, quantity: nextQuantity });
    await save(input.db, input.phone, input.customer.id, "fast_errands_cart", { flow: "fast_errands", cart: nextCart, categoryId: category.id });
    return [`${fastErrandCartSummary(catalog, nextCart)}\n\nReply another item number to add one, CATEGORIES to add from another category, or CHECKOUT when ready.`];
  }

  if (state === "fast_errands_address") {
    const address = sanitizeAddressText(text);
    if (address.length < 6) return ["Please send a complete delivery address with a street, area, and landmark."];
    if (!cart.length) return ["This FastErrands cart has expired. Reply FASTERRANDS to start again."];
    await save(input.db, input.phone, input.customer.id, "fast_errands_vehicle", { flow: "fast_errands", cart, address });
    return ["Choose a rider: reply BICYCLE for light items on an assigned bicycle, or BIKE for a motorcycle."];
  }

  if (state === "fast_errands_vehicle") {
    const vehicleOption = command === "BICYCLE" ? "bicycle" : ["BIKE", "MOTORCYCLE"].includes(command) ? "motorcycle" : "";
    if (!vehicleOption) return ["Reply BICYCLE or BIKE."];
    const address = string(data.address);
    if (!address || !cart.length) return ["This FastErrands draft has expired. Reply FASTERRANDS to start again."];
    try {
      const quote = await quoteFastErrands(input.db, cart, address, vehicleOption);
      await save(input.db, input.phone, input.customer.id, "fast_errands_review", { flow: "fast_errands", cart, address, vehicleOption });
      return [fastErrandReview(catalog, cart, address, quote)];
    } catch (error) {
      return [fastErrandErrorMessage(error)];
    }
  }

  if (state === "fast_errands_review") {
    const paymentMethod = whatsappPaymentMethod(command);
    if (!paymentMethod) return ["Reply PAY CARD or PAY TRANSFER to create your secure checkout, or CANCEL to discard this FastErrand."];
    try {
      const checkout = await createFastErrandPayment(input.db, input.customer, input.phone, cart, string(data.address), string(data.vehicleOption), paymentMethod);
      await save(input.db, input.phone, input.customer.id, "ready", {});
      return [`Your FastErrand ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter payment, return to this WhatsApp chat. We will confirm your FastErrand and send updates here.`];
    } catch (error) {
      return [fastErrandErrorMessage(error, "We could not create the secure FastErrand checkout. Your cart has not been charged. Reply PAY to try again.")];
    }
  }
  return ["Reply CANCEL to return to the main menu."];
}

async function beginStorageBooking(input: { db: SupabaseClient; phone: string; customer: Customer }) {
  const items = await loadStorageCatalog(input.db);
  if (!items.length) return ["Storage Facility Booking is unavailable right now. Please try again shortly."];
  await save(input.db, input.phone, input.customer.id, "storage_cart", { flow: "storage", cart: [], itemIds: items.slice(0, 9).map((item) => item.id) });
  return [storageItemMenu(items, [])];
}

async function handleStorageBooking(
  input: { db: SupabaseClient; phone: string; customer: Customer },
  state: string,
  data: JsonRecord,
  text: string,
  command: string
) {
  const items = await loadStorageCatalog(input.db);
  const cart = storageCartFrom(data.cart, items);

  if (state === "storage_cart") {
    const itemIds = strings(data.itemIds);
    if (command === "MENU") return [storageItemMenu(items, cart)];
    if (command === "CHECKOUT") {
      if (!cart.length) return ["Your storage booking has no items. Reply MENU and add an item first."];
      await save(input.db, input.phone, input.customer.id, "storage_duration", { flow: "storage", cart });
      return ["Choose your storage duration: reply 1 for 1 Day, 2 for 3 Days, 3 for 1 Week, 4 for 2 Weeks, or 5 for 1 Month."];
    }
    const change = parseCartChange(command);
    const item = change ? items.find((entry) => entry.id === itemIds[change.index - 1]) : null;
    if (!change || !item) return ["Reply with an item number to add one. Reply ADD <number> <quantity> for more, REMOVE <number> to remove an item, or CHECKOUT when ready."];
    const current = cart.find((entry) => entry.itemId === item.id);
    const nextQuantity = change.action === "remove" ? 0 : Math.min(50, (current?.quantity || 0) + change.quantity);
    const nextCart = cart.filter((entry) => entry.itemId !== item.id);
    if (nextQuantity) nextCart.push({ itemId: item.id, quantity: nextQuantity, otherDescription: current?.otherDescription || "" });
    if (item.is_other && nextQuantity && !current?.otherDescription) {
      await save(input.db, input.phone, input.customer.id, "storage_other_description", { flow: "storage", cart: nextCart, itemIds, otherItemId: item.id });
      return ["Please describe the Other Item you want to store."];
    }
    await save(input.db, input.phone, input.customer.id, "storage_cart", { flow: "storage", cart: nextCart, itemIds });
    return [`${storageCartSummary(items, nextCart)}\n\nReply another item number to add one, or CHECKOUT when ready.`];
  }

  if (state === "storage_other_description") {
    const otherItemId = string(data.otherItemId);
    const description = text.trim().slice(0, 500);
    if (description.length < 3) return ["Please describe the Other Item in at least three characters."];
    const nextCart = cart.map((entry) => entry.itemId === otherItemId ? { ...entry, otherDescription: description } : entry);
    await save(input.db, input.phone, input.customer.id, "storage_cart", { flow: "storage", cart: nextCart, itemIds: items.slice(0, 9).map((item) => item.id) });
    return [`${storageCartSummary(items, nextCart)}\n\nReply another item number to add one, or CHECKOUT when ready.`];
  }

  if (state === "storage_duration") {
    const duration = storageDurationChoice(command);
    if (!duration) return ["Reply 1 for 1 Day, 2 for 3 Days, 3 for 1 Week, 4 for 2 Weeks, or 5 for 1 Month."];
    await save(input.db, input.phone, input.customer.id, "storage_pickup_choice", { flow: "storage", cart, duration });
    return ["Would you like Fast Fleets to collect the items? Reply PICKUP, or SELF if you will bring them to the facility."];
  }

  if (state === "storage_pickup_choice") {
    if (["SELF", "NO", "DROP OFF", "DROPOFF"].includes(command)) {
      await save(input.db, input.phone, input.customer.id, "storage_acknowledgement", { ...data, cart, pickupSelected: false });
      return [storageSafetyPrompt()];
    }
    if (["PICKUP", "YES"].includes(command)) {
      await save(input.db, input.phone, input.customer.id, "storage_pickup_address", { ...data, cart, pickupSelected: true });
      return ["Please send the full pickup address, including area and a landmark."];
    }
    return ["Reply PICKUP for Fast Fleets collection, or SELF if you will bring the items to the facility."];
  }

  if (state === "storage_pickup_address") {
    const pickupAddress = sanitizeAddressText(text);
    if (pickupAddress.length < 6) return ["Please send a complete pickup address with a street, area, and landmark."];
    await save(input.db, input.phone, input.customer.id, "storage_pickup_vehicle", { ...data, cart, pickupAddress });
    return ["Choose a collection vehicle: reply BIKE, CAR, or VAN."];
  }

  if (state === "storage_pickup_vehicle") {
    const pickupVehicle = command.toLowerCase();
    if (!dispatchVehicles.has(pickupVehicle)) return ["Reply BIKE, CAR, or VAN."];
    await save(input.db, input.phone, input.customer.id, "storage_pickup_instructions", { ...data, cart, pickupVehicle });
    return ["Reply with any pickup instructions, or reply SKIP."];
  }

  if (state === "storage_pickup_instructions") {
    const pickupInstructions = command === "SKIP" ? "" : text.slice(0, 500);
    await save(input.db, input.phone, input.customer.id, "storage_acknowledgement", { ...data, cart, pickupInstructions });
    return [storageSafetyPrompt()];
  }

  if (state === "storage_acknowledgement") {
    if (!["CONFIRM", "I CONFIRM", "YES"].includes(command)) return ["Reply CONFIRM only if the items contain no prohibited or hazardous goods, or CANCEL to stop this booking."];
    try {
      const quote = await quoteStorage(input.db, cart, data);
      await save(input.db, input.phone, input.customer.id, "storage_review", { ...data, cart, prohibitedAcknowledged: true });
      return [storageReview(items, quote, Boolean(data.pickupSelected))];
    } catch (error) {
      return [storageErrorMessage(error)];
    }
  }

  if (state === "storage_review") {
    const paymentMethod = whatsappPaymentMethod(command);
    if (!paymentMethod) return ["Reply PAY CARD or PAY TRANSFER to create your secure checkout, or CANCEL to discard this storage booking."];
    try {
      const checkout = await createStoragePayment(input.db, input.customer, input.phone, cart, data, paymentMethod);
      await save(input.db, input.phone, input.customer.id, "ready", {});
      return [`Your storage booking ${checkout.code} is ready for payment.\n\nPay securely here: ${checkout.authorizationUrl}\n\nAfter payment, return to this WhatsApp chat. We will confirm your booking and send updates here.`];
    } catch (error) {
      return [storageErrorMessage(error, "We could not create the secure storage checkout. Your booking has not been charged. Reply PAY to try again.")];
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
  const products = availableProducts(vendor).slice(0, 20);
  return `${vendor.name}\n${kind === "shopping" ? vendor.area : vendor.address}\n\n${products.map((product, index) => `${index + 1}. ${product.name} — ₦${formatMoney(product.price)}`).join("\n")}\n\nReply with an item number to add one. Reply MORE <number> to add another one, or REMOVE <number> to remove it.\n${cart.length ? `${cartSummary(vendor, cart)}\n` : ""}Reply CHECKOUT when you are ready.`;
}

function availableProducts(vendor: CatalogVendor) {
  return vendor.products.filter((product) => product.available);
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
  const more = command.match(/^MORE\s+(\d+)$/);
  if (more) return { action: "add" as const, index: Number(more[1]), quantity: 1 };
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
  assertWhatsAppPaymentReturnConfigured();
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
    const callback = new URL("/whatsapp/payment-return", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", target.code); callback.searchParams.set("token", whatsappPaymentReturnToken(reference));
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
  assertWhatsAppPaymentReturnConfigured();
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
    const callback = new URL("/whatsapp/payment-return", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", delivery.delivery_code); callback.searchParams.set("token", whatsappPaymentReturnToken(reference));
    const squad = await initiateSquadPayment({ amountNgn: quote.total, email: customer.email, reference, callbackUrl: callback.toString(), customerName: customer.full_name || null, channels: paymentChannelsFor(paymentMethod), metadata: { purpose: "delivery_payment", delivery_code: delivery.delivery_code, source: "whatsapp_ordering" } });
    await markPaymentIntentPending(db, intent.id);
    return { code: delivery.delivery_code, authorizationUrl: squad.authorizationUrl };
  } catch (error) {
    if (intent) await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
    await db.from("deliveries").update({ status: "cancelled" }).eq("id", delivery.id);
    throw error;
  }
}

type FastErrandCartItem = { itemId: string; quantity: number };
type StorageCatalogItem = { id: string; name: string; description: string | null; is_other: boolean };
type StorageCartItem = { itemId: string; quantity: number; otherDescription: string };

function fastErrandCategoryMenu(categories: FastErrandsCategory[], cart: FastErrandCartItem[] = []) {
  return `FastErrands\n\n${categories.slice(0, 9).map((category, index) => `${index + 1}. ${category.emoji || "📦"} ${category.name}`).join("\n")}\n\nReply with a category number.${cart.length ? " Your cart will be kept." : ""}\n\nReply CANCEL at any time to return to the main menu.`;
}

function fastErrandItemMenu(category: FastErrandsCategory, cart: FastErrandCartItem[]) {
  const items = category.items.filter((item) => item.is_active).slice(0, 20);
  return `${category.emoji || "📦"} ${category.name}\n\n${items.map((item, index) => `${index + 1}. ${item.name} — ₦${formatMoney(Number(item.price_ngn))}`).join("\n")}\n\nReply with an item number to add one. Reply ADD <number> <quantity> for more, REMOVE <number> to remove an item, CATEGORIES to browse more, or CHECKOUT when ready.${cart.length ? `\n\n${fastErrandCartSummary([category], cart)}` : ""}`;
}

function fastErrandCartFrom(value: unknown, catalog: FastErrandsCategory[]): FastErrandCartItem[] {
  if (!Array.isArray(value)) return [];
  const items = catalog.flatMap((category) => category.items).filter((item) => item.is_active);
  return value.flatMap((entry) => {
    const itemId = string(record(entry).itemId);
    const quantity = Math.min(25, Math.max(1, Math.round(Number(record(entry).quantity || 1))));
    return items.some((item) => item.id === itemId) && Number.isFinite(quantity) ? [{ itemId, quantity }] : [];
  });
}

function fastErrandCartSummary(catalog: FastErrandsCategory[], cart: FastErrandCartItem[]) {
  const items = catalog.flatMap((category) => category.items);
  const lines = cart.flatMap((entry) => {
    const item = items.find((candidate) => candidate.id === entry.itemId);
    return item ? [`${entry.quantity}× ${item.name} — ₦${formatMoney(Number(item.price_ngn) * entry.quantity)}`] : [];
  });
  const total = cart.reduce((sum, entry) => sum + (Number(items.find((candidate) => candidate.id === entry.itemId)?.price_ngn) || 0) * entry.quantity, 0);
  return `Your FastErrands cart\n${lines.join("\n")}\nItems subtotal: ₦${formatMoney(total)}`;
}

async function quoteFastErrands(db: SupabaseClient, cart: FastErrandCartItem[], address: string, vehicleOption: string) {
  const selectedVehicle = customerVehicleSelection(vehicleOption);
  if (!selectedVehicle || !["bicycle", "motorcycle"].includes(selectedVehicle.id)) throw new FastErrandQuoteError("Choose an available bicycle or bike rider option.", 400);
  return resolveFastErrandQuote({ db, items: cart as FastErrandRequestedItem[], address, selectedVehicle });
}

function fastErrandReview(catalog: FastErrandsCategory[], cart: FastErrandCartItem[], address: string, quote: Awaited<ReturnType<typeof resolveFastErrandQuote>>) {
  return `FastErrand review\n\n${fastErrandCartSummary(catalog, cart)}\nFastErrand delivery: ₦${formatMoney(quote.serviceFeeNgn)}\nTotal: ₦${formatMoney(quote.customerTotalNgn)}\nDeliver to: ${address}\nDistance: ${quote.displayDistanceKm.toFixed(2)} km · about ${quote.etaMinutes} min\n\nReply PAY CARD or PAY TRANSFER to continue securely, or CANCEL to discard.`;
}

async function createFastErrandPayment(db: SupabaseClient, customer: Customer, phone: string, cart: FastErrandCartItem[], address: string, vehicleOption: string, paymentMethod: "card" | "transfer") {
  if (!customer.email?.includes("@")) throw new Error("Missing customer email");
  assertWhatsAppPaymentReturnConfigured();
  const quote = await quoteFastErrands(db, cart, address, vehicleOption);
  const selectedVehicle = customerVehicleSelection(vehicleOption);
  const vehicle = selectedVehicle && quote.vehicleOptions.find((option) => option.id === selectedVehicle.id);
  if (!selectedVehicle || !vehicle || vehicle.availability.status === "unavailable") throw new Error("That rider option is no longer available.");
  const snapshot = buildFastErrandV2Snapshot({
    pricing_mode: "neighborhood", goods_subtotal_ngn: quote.goodsSubtotalNgn, service_fee_ngn: quote.serviceFeeNgn, customer_total_ngn: quote.customerTotalNgn, minimum_cart_ngn: quote.minimumCartNgn, road_distance_meters: quote.roadDistanceMeters,
    service_area: { id: quote.area.id, code: quote.area.code, name: quote.area.name, priority: Number(quote.area.priority), pricing_version: Number(quote.area.pricing_version) },
    pricing_band: { id: quote.band.id, min_distance_exclusive_meters: Number(quote.band.min_distance_exclusive_meters), max_distance_inclusive_meters: Number(quote.band.max_distance_inclusive_meters), service_fee_ngn: quote.serviceFeeNgn },
    fulfilment: { business_profile_id: quote.area.business_profile_id, business_name: quote.business?.business_name || null, origin_address: quote.area.origin_address, origin_place_id: quote.area.origin_place_id, origin_latitude: Number(quote.area.origin_latitude) || null, origin_longitude: Number(quote.area.origin_longitude) || null },
    selected_vehicle: { id: selectedVehicle.id, vehicle: selectedVehicle.vehicle, vehicle_subtype: selectedVehicle.vehicleSubtype, label: selectedVehicle.label }, customer_note: null, quote_fingerprint: quote.fingerprint
  });
  const reference = generatePaymentReference("FFE");
  const { data: order, error } = await db.from("orders").insert({
    order_code: reference, customer_id: customer.id, business_id: quote.business?.user_id, business_profile_id: quote.area.business_profile_id, marketplace_kind: "fast_errands", items: quote.items,
    customer_contact: phone || customer.email, pickup_address: quote.area.origin_address, dropoff_address: address, package_type: "FastErrand neighbourhood procurement", vehicle_type: selectedVehicle.vehicle, vehicle_subtype: selectedVehicle.vehicleSubtype,
    status: "pending", amount: quote.customerTotalNgn, delivery_fee_ngn: quote.serviceFeeNgn, platform_fee_ngn: 0, distance_km: quote.displayDistanceKm, eta_minutes: quote.etaMinutes, route_source: quote.route.source, route_type: "road", payment_method: paymentMethod, payment_status: "pending",
    metadata: { source: "whatsapp_ordering", whatsapp_phone: phone, payment_provider: "squad", provider_reference: reference, payment_choice: paymentMethod, fast_errand: snapshot }
  }).select("id, order_code").single<{ id: string; order_code: string }>();
  if (error || !order) throw error || new Error("Could not create FastErrand order.");
  let intent;
  try {
    intent = await createPaymentIntent(db, { reference, internalReference: `fast-errand-order:${order.id}`, purpose: "marketplace_business_order", ownerUserId: customer.id, amountNgn: quote.customerTotalNgn, orderId: order.id });
    const callback = new URL("/whatsapp/payment-return", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", order.order_code); callback.searchParams.set("token", whatsappPaymentReturnToken(reference));
    const squad = await initiateSquadPayment({ amountNgn: quote.customerTotalNgn, email: customer.email, reference, callbackUrl: callback.toString(), customerName: customer.full_name || null, channels: paymentChannelsFor(paymentMethod), metadata: { purpose: "fast_errand_neighborhood_order", order_id: order.id, order_code: order.order_code, source: "whatsapp_ordering" } });
    await markPaymentIntentPending(db, intent.id);
    return { code: order.order_code, authorizationUrl: squad.authorizationUrl };
  } catch (error) {
    if (intent) await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
    await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
    throw error;
  }
}

async function loadStorageCatalog(db: SupabaseClient): Promise<StorageCatalogItem[]> {
  const { data, error } = await db.from("storage_catalog_items").select("id, name, description, is_other").eq("is_active", true).order("sort_order").limit(50);
  if (error) throw error;
  return (data || []) as StorageCatalogItem[];
}

function storageItemMenu(items: StorageCatalogItem[], cart: StorageCartItem[]) {
  const shown = items.slice(0, 9);
  return `Storage Facility Booking\n\n${shown.map((item, index) => `${index + 1}. ${item.name}${item.description ? ` — ${item.description}` : ""}`).join("\n")}\n\nReply with an item number to add one. Reply ADD <number> <quantity> for more, REMOVE <number> to remove an item, or CHECKOUT when ready.${cart.length ? `\n\n${storageCartSummary(items, cart)}` : ""}`;
}

function storageCartFrom(value: unknown, items: StorageCatalogItem[]): StorageCartItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const itemId = string(record(entry).itemId);
    const quantity = Math.min(50, Math.max(1, Math.round(Number(record(entry).quantity || 1))));
    return items.some((item) => item.id === itemId) && Number.isFinite(quantity) ? [{ itemId, quantity, otherDescription: string(record(entry).otherDescription).slice(0, 500) }] : [];
  });
}

function storageCartSummary(items: StorageCatalogItem[], cart: StorageCartItem[]) {
  const lines = cart.flatMap((entry) => {
    const item = items.find((candidate) => candidate.id === entry.itemId);
    return item ? [`${entry.quantity}× ${item.name}${entry.otherDescription ? ` (${entry.otherDescription})` : ""}`] : [];
  });
  return `Your storage items\n${lines.join("\n")}`;
}

function storageDurationChoice(command: string) {
  return ({ "1": "day_1", "2": "day_3", "3": "week_1", "4": "week_2", "5": "month_1" } as Record<string, string>)[command] || null;
}

function storageSafetyPrompt() {
  return "Safety confirmation\n\nStorage cannot accept prohibited or hazardous goods. Reply CONFIRM only if your items contain none of these goods.";
}

async function quoteStorage(db: SupabaseClient, cart: StorageCartItem[], data: JsonRecord) {
  const duration = string(data.duration);
  if (!storageDuration(duration)) throw new StorageQuoteError("Choose a valid storage duration.", 400);
  return resolveStorageQuote({ db, items: cart, duration, pickupSelected: data.pickupSelected === true, pickupAddress: string(data.pickupAddress), pickupVehicle: storagePickupVehicle(data.pickupVehicle) });
}

function storagePickupVehicle(value: unknown): "bike" | "car" | "van" | undefined {
  const vehicle = string(value).toLowerCase();
  return vehicle === "bike" || vehicle === "car" || vehicle === "van" ? vehicle : undefined;
}

function storageReview(items: StorageCatalogItem[], quote: Awaited<ReturnType<typeof resolveStorageQuote>>, pickupSelected: boolean) {
  const cart = quote.items.map((item) => ({ itemId: item.item_id, quantity: item.quantity, otherDescription: item.other_description || "" }));
  return `Storage booking review\n\n${storageCartSummary(items, cart)}\nDuration: ${quote.duration.label}\nStorage: ₦${formatMoney(quote.storageSubtotalNgn)}\nPickup: ₦${formatMoney(quote.pickup?.feeNgn || 0)}\nTotal: ₦${formatMoney(quote.totalNgn)}${pickupSelected && quote.pickup ? `\nCollection distance: ${quote.pickup.distanceKm.toFixed(2)} km` : ""}\n\nReply PAY CARD or PAY TRANSFER to continue securely, or CANCEL to discard.`;
}

async function createStoragePayment(db: SupabaseClient, customer: Customer, phone: string, cart: StorageCartItem[], data: JsonRecord, paymentMethod: "card" | "transfer") {
  if (!customer.email?.includes("@")) throw new Error("Missing customer email");
  assertWhatsAppPaymentReturnConfigured();
  if (data.prohibitedAcknowledged !== true) throw new StorageQuoteError("Confirm that your items contain no prohibited or hazardous goods.", 400);
  const quote = await quoteStorage(db, cart, data);
  const reference = generatePaymentReference("ST");
  const pickupAddress = string(data.pickupAddress);
  const pickupInstructions = string(data.pickupInstructions).slice(0, 500) || null;
  const { data: order, error: orderError } = await db.from("orders").insert({
    order_code: reference, customer_id: customer.id, marketplace_kind: "storage_facility", items: quote.items, customer_contact: phone || customer.email, pickup_address: quote.pickup ? pickupAddress : quote.facility.address, dropoff_address: quote.facility.address,
    package_type: "Storage facility booking", vehicle_type: quote.pickup?.vehicle || "any", status: "pending", amount: quote.totalNgn, delivery_fee_ngn: quote.pickup?.feeNgn || 0, platform_fee_ngn: 0, distance_km: quote.pickup?.distanceKm || 0, eta_minutes: quote.pickup?.etaMinutes || 0, route_source: quote.pickup?.routeSource || null, route_type: "storage", payment_method: paymentMethod, payment_status: "pending",
    metadata: { source: "whatsapp_ordering", whatsapp_phone: phone, payment_provider: "squad", provider_reference: reference, payment_choice: paymentMethod, storage: { schema_version: 1, facility: quote.facility, duration: quote.duration, duration_key: quote.durationKey, storage_subtotal_ngn: quote.storageSubtotalNgn, pickup: quote.pickup, total_ngn: quote.totalNgn, fingerprint: quote.fingerprint, prohibited_acknowledged_at: new Date().toISOString(), pickup_instructions: pickupInstructions } }
  }).select("id, order_code").single<{ id: string; order_code: string }>();
  if (orderError || !order) throw orderError || new Error("Could not create storage order.");
  const { data: booking, error: bookingError } = await db.from("storage_bookings").insert({
    order_id: order.id, customer_id: customer.id, facility_id: quote.facility.id, pickup_selected: Boolean(quote.pickup), pickup_address: quote.pickup ? pickupAddress : null, pickup_contact: phone || customer.email, pickup_instructions: pickupInstructions, prohibited_items_acknowledged_at: new Date().toISOString(), snapshot: { ...quote, created_at: new Date().toISOString() }
  }).select("id, booking_reference").single<{ id: string; booking_reference: string }>();
  if (bookingError || !booking) {
    await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
    throw bookingError || new Error("Could not create storage booking.");
  }
  let intent;
  try {
    intent = await createPaymentIntent(db, { reference, internalReference: `storage-booking:${booking.id}`, purpose: "marketplace_business_order", ownerUserId: customer.id, amountNgn: quote.totalNgn, orderId: order.id });
    const callback = new URL("/whatsapp/payment-return", siteUrl());
    callback.searchParams.set("reference", reference); callback.searchParams.set("code", booking.booking_reference); callback.searchParams.set("token", whatsappPaymentReturnToken(reference));
    const squad = await initiateSquadPayment({ amountNgn: quote.totalNgn, email: customer.email, reference, callbackUrl: callback.toString(), customerName: customer.full_name || null, channels: paymentChannelsFor(paymentMethod), metadata: { purpose: "storage_facility_booking", order_id: order.id, storage_booking_id: booking.id, source: "whatsapp_ordering" } });
    await markPaymentIntentPending(db, intent.id);
    return { code: booking.booking_reference, authorizationUrl: squad.authorizationUrl };
  } catch (error) {
    if (intent) await markPaymentIntentInitializationFailed(db, intent.id).catch(() => undefined);
    await db.from("orders").update({ status: "cancelled", payment_status: "failed" }).eq("id", order.id);
    throw error;
  }
}

function fastErrandErrorMessage(error: unknown, fallback = "We could not refresh your FastErrand quote. Please try again.") {
  return error instanceof FastErrandQuoteError ? error.message : fallback;
}

function storageErrorMessage(error: unknown, fallback = "We could not refresh your storage quote. Please try again.") {
  return error instanceof StorageQuoteError ? error.message : fallback;
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
  return `Welcome, ${name}.\n\nReply 1 to order food or shopping.\nReply 2 to send a delivery.\nReply 3 for FastErrands.\nReply 4 to book a storage facility.\n\nReply CANCEL or MENU at any time to return here.`;
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
