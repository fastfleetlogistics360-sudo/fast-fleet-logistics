import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultRestaurantKitchens, normalizeRestaurantKitchens, restaurantMenuSettingsKey } from "@/lib/restaurant-menu";
import { defaultShoppingMalls, mallMenuSettingsKey, normalizeShoppingMalls } from "@/lib/mall-menu";
import { configuredConversationProvider, generateProviderAnswer, type ConversationProviderId, type ProviderAnswer } from "@/lib/automation/conversation-provider";
import { approvedCompanyKnowledge } from "@/lib/automation/company-knowledge";

export type CustomerIntent = "general" | "company_information" | "delivery_enquiry" | "delivery_status" | "order_status" | "restaurant_discovery" | "shopping_enquiry" | "fast_errand" | "rider_operations" | "storage_facilities" | "heavy_logistics" | "customer_support" | "vendor_onboarding" | "clarify" | "refuse";
export type CustomerConversationContext = { previousIntent?: CustomerIntent; referencedDeliveryCode?: string | null; referencedOrderCode?: string | null };
export type CustomerIntelligenceResult = {
  answer: string; intent: CustomerIntent; entities: Record<string, string>; tools: string[];
  provider: ConversationProviderId; providerModel: string | null; mode: "generative" | "deterministic_fallback";
  responseKind: "knowledge_retrieval" | "tool_result" | "clarification" | "refusal";
  context: CustomerConversationContext; providerFailureCategory: ProviderAnswer["failureCategory"] | null;
};

type KnowledgeEntry = { id: string; intents: CustomerIntent[]; terms: string[]; text: string; version: string };
const knowledge: KnowledgeEntry[] = [
  { id: "services", intents: ["company_information"], terms: ["service", "offer", "about", "fast fleets"], version: "2026.11", text: "Fast Fleets 360 provides dispatch and package delivery, restaurant food delivery, shopping for groceries, medicine, fashion, electronics and gadgets, FastErrand, storage facilities and heavy logistics. FastConfirm™ provides post-pickup evidence before final drop-off, while Secure Hand-Off supports final handover confirmation." },
  { id: "delivery", intents: ["delivery_enquiry"], terms: ["send", "package", "parcel", "dispatch", "delivery"], version: "2026.11", text: "To send a package, use the dispatch booking flow and provide pickup, drop-off, item details and recipient contact information. Availability, pricing and rider assignment are confirmed in that flow. FAST AI cannot create or change a delivery." },
  { id: "fastconfirm", intents: ["company_information"], terms: ["fastconfirm", "fast confirm", "secure hand-off", "secure handoff"], version: "2026.11", text: "FastConfirm™ provides pickup evidence and relevant item details after a rider picks up an item, so the customer can confirm the item before final drop-off. Secure Hand-Off adds a secure confirmation step at the final delivery handover." },
  { id: "rider", intents: ["rider_operations"], terms: ["rider", "cyclist", "delivery partner", "become"], version: "2026.11", text: "To become a Fast Fleets delivery partner, apply through the rider or cyclist onboarding process with valid identification, contact details, vehicle or bicycle information, and requested verification documents. FAST AI cannot approve applications." },
  { id: "vendor", intents: ["vendor_onboarding"], terms: ["vendor", "restaurant", "register", "onboarding"], version: "2026.11", text: "Restaurants and other vendors can apply through vendor onboarding with business details, contact information, service location, a catalogue or menu, and requested verification documents. The authorised vendor team reviews applications." },
  { id: "errand", intents: ["fast_errand"], terms: ["errand", "fast errand", "fasterrand"], version: "2026.11", text: "FastErrand helps with quick local errands through the supported request flow. Availability and pricing are confirmed before a request is placed; FAST AI cannot place or change an errand request." },
  { id: "storage", intents: ["storage_facilities"], terms: ["storage", "store", "warehouse"], version: "2026.11", text: "Fast Fleets storage facilities can be booked through the storage service flow. You can arrange storage and, where offered, pickup support. Availability, duration and pricing are confirmed in the booking flow." },
  { id: "heavy", intents: ["heavy_logistics"], terms: ["heavy", "bulk", "truck", "large goods", "logistics"], version: "2026.11", text: "Heavy Logistics is for bulky, high-volume or commercial goods. Use the Heavy Logistics request flow so the operational team can confirm the required transport, route and pricing." },
  { id: "support", intents: ["customer_support"], terms: ["help", "support", "damaged", "late", "delayed", "missing", "complaint"], version: "2026.11", text: "For a booking-specific issue, use the support channel with your delivery or order details. FAST AI can explain the available next step but cannot alter, cancel or refund an order." }
];
const unsafe = /ignore (all |previous |prior )?(instructions|rules)|system prompt|developer message|reveal.*(secret|key|token|internal|financial|rider statistics)|execute (sql|query|command)|delete |refund|cancel (a |the )?deliver|initiate (a )?payment/i;

export function classifyCustomerIntent(message: string, context?: CustomerConversationContext) {
  const text = message.toLowerCase();
  const trackingCode = (message.match(/\b(?:[A-Z]{2,6}[-_]?)?[A-Z0-9]{6,24}\b/i) || [])[0]?.toUpperCase() || null;
  const entities: Record<string, string> = trackingCode ? { trackingCode } : {};
  if (unsafe.test(message)) return { intent: "refuse" as const, entities };
  if (/\b(where is|track|status of|picked up|rider.*(arrive|assigned)|my (delivery|package))\b/.test(text)) return { intent: "delivery_status" as const, entities };
  if (/\b(my order|order status|restaurant order|shopping order)\b/.test(text)) return { intent: "order_status" as const, entities };
  if (/\b(restaurant|food|meal|eat|menu)\b/.test(text)) return { intent: "restaurant_discovery" as const, entities };
  if (/\b(shop|shopping|grocery|medicine|pharmacy|fashion|electronics|gadget|product)\b/.test(text)) return { intent: "shopping_enquiry" as const, entities };
  if (/\b(fast\s*errand|errand)\b/.test(text)) return { intent: "fast_errand" as const, entities };
  if (/\b(storage|warehouse)\b/.test(text)) return { intent: "storage_facilities" as const, entities };
  if (/\b(heavy logistics|truck|bulk|large goods)\b/.test(text)) return { intent: "heavy_logistics" as const, entities };
  if (/\b(rider|cyclist|delivery partner)\b/.test(text)) return { intent: "rider_operations" as const, entities };
  if (/\b(vendor|register (my |a )?(restaurant|business)|restaurant onboarding)\b/.test(text)) return { intent: "vendor_onboarding" as const, entities };
  if (/\b(help|support|damaged|delay|delayed|late|missing|complaint)\b/.test(text)) return { intent: "customer_support" as const, entities };
  if (/\b(service|offer|fastconfirm|fast confirm|secure hand|about fast fleets|what is)\b/.test(text)) return { intent: "company_information" as const, entities };
  if (/\b(that|it|them|yesterday|the one)\b/.test(text) && context?.previousIntent) return { intent: context.previousIntent, entities };
  if (/\b(hi|hello|how are you|thanks|thank you)\b/.test(text)) return { intent: "general" as const, entities };
  return { intent: "clarify" as const, entities };
}

export async function answerCustomerIntelligence(input: { message: string; context?: CustomerConversationContext; userId?: string | null; db?: SupabaseClient | null }): Promise<CustomerIntelligenceResult> {
  const parsed = classifyCustomerIntent(input.message, input.context);
  if (parsed.intent === "refuse") return deterministic("I can help with approved Fast Fleets 360 information and your own supported status requests. I cannot reveal internal data, access another person’s account, or carry out payment, cancellation or delivery actions.", parsed, "refusal");
  if (parsed.intent === "clarify") return deterministic("I can help with Fast Fleets services, deliveries, order status, restaurants, shopping, FastErrand, storage, heavy logistics, rider or vendor onboarding, and support. Which would you like help with?", parsed, "clarification");
  if (parsed.intent === "general") return deterministic("Hello! I’m FAST AI, your Fast Fleets 360 assistant. What can I help you with today?", parsed, "knowledge_retrieval");

  const tool = await runReadOnlyTool(parsed.intent, parsed.entities, input.userId || null, input.db || null);
  const retrieved = tool?.answer || await retrieveKnowledge(parsed.intent, input.message, input.db || null);
  const responseKind = tool ? "tool_result" : "knowledge_retrieval";
  const provider = await generateProviderAnswer({ question: input.message, intelligenceBrief: `Verified ${responseKind === "tool_result" ? "tool result" : "company knowledge"}:\n${retrieved}`, deterministicAnswer: retrieved, audience: "customer" });
  return { answer: provider.answer, intent: parsed.intent, entities: parsed.entities, tools: tool ? [tool.name] : [], provider: provider.provider, providerModel: provider.provider === "groq" ? configuredConversationProvider().model : null, mode: provider.mode, responseKind, context: { previousIntent: parsed.intent, referencedDeliveryCode: tool?.deliveryCode || input.context?.referencedDeliveryCode || null, referencedOrderCode: tool?.orderCode || input.context?.referencedOrderCode || null }, providerFailureCategory: provider.failureCategory || null };
}

async function retrieveKnowledge(intent: CustomerIntent, message: string, db: SupabaseClient | null) {
  const category = knowledgeCategoryForIntent(intent);
  if (db && category) {
    const { data } = await db.from("fast_ai_knowledge_entries").select("slug, title, body, source_metadata, version").eq("status", "published").eq("category", category).order("updated_at", { ascending: false }).limit(30);
    const ranked = (data || []).map((entry: { slug: string; title: string; body: string; source_metadata?: unknown; version: number }) => ({ ...entry, score: relevance(`${entry.title} ${entry.body}`, message) })).filter(entry => entry.score > 0).sort((a, b) => b.score - a.score)[0];
    if (ranked) return `${ranked.body}\nSource: Fast Fleets 360 approved knowledge (${ranked.slug}, version ${ranked.version}).`;
  }
  const tokens = new Set(message.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
  const entry = knowledge.filter(item => item.intents.includes(intent) || (intent === "company_information" && item.terms.some(term => tokens.has(term.replace(/\s/g, "")) || message.toLowerCase().includes(term)))).sort((a, b) => b.terms.filter(term => message.toLowerCase().includes(term)).length - a.terms.filter(term => message.toLowerCase().includes(term)).length)[0];
  if (entry) return `${entry.text}\nSource: Fast Fleets 360 approved knowledge (${entry.id}, version ${entry.version}).`;
  return approvedCompanyKnowledge(intent === "rider_operations" ? "rider_enquiry" : intent === "vendor_onboarding" ? "vendor_enquiry" : intent === "customer_support" ? "customer_support" : "company_info", message);
}

function relevance(source: string, question: string) {
  const sourceTerms = new Set(source.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2));
  return question.toLowerCase().split(/[^a-z0-9]+/).filter(term => term.length > 2).reduce((score, term) => score + (sourceTerms.has(term) ? 1 : 0), 0);
}

function knowledgeCategoryForIntent(intent: CustomerIntent) {
  return ({ company_information: "company", delivery_enquiry: "delivery", fast_errand: "fast_errand", rider_operations: "rider", vendor_onboarding: "vendor", storage_facilities: "storage", heavy_logistics: "heavy_logistics", customer_support: "support", restaurant_discovery: "marketplace", shopping_enquiry: "shopping" } as Partial<Record<CustomerIntent, string>>)[intent] || null;
}

async function runReadOnlyTool(intent: CustomerIntent, entities: Record<string, string>, userId: string | null, db: SupabaseClient | null) {
  if (!db) return null;
  if (intent === "delivery_status") {
    if (!userId) return { name: "get_delivery_status", answer: "Please sign in to check the status of your own delivery. You can also use the public tracking page with a delivery code.", deliveryCode: null, orderCode: null };
    let query = db.from("deliveries").select("delivery_code, status, eta_minutes, updated_at").eq("customer_id", userId).order("updated_at", { ascending: false }).limit(1);
    if (entities.trackingCode) query = db.from("deliveries").select("delivery_code, status, eta_minutes, updated_at").eq("customer_id", userId).eq("delivery_code", entities.trackingCode).limit(1);
    const { data, error } = await query.maybeSingle<{ delivery_code: string; status: string; eta_minutes: number | null; updated_at: string | null }>();
    if (error) return { name: "get_delivery_status", answer: "I could not retrieve your delivery status right now. Please try again shortly.", deliveryCode: null, orderCode: null };
    if (!data) return { name: "get_delivery_status", answer: "I could not find a matching delivery in your account. Check the tracking code or open your Orders tab.", deliveryCode: null, orderCode: null };
    return { name: "get_delivery_status", answer: `Your delivery ${data.delivery_code} is currently ${String(data.status).replaceAll("_", " ")}.${data.eta_minutes ? ` Estimated time: ${data.eta_minutes} minutes.` : ""}`, deliveryCode: data.delivery_code, orderCode: null };
  }
  if (intent === "order_status") {
    if (!userId) return { name: "get_order_details", answer: "Please sign in to check the status of your own order.", deliveryCode: null, orderCode: null };
    let query = db.from("orders").select("order_code, status, marketplace_kind, updated_at").eq("customer_id", userId).order("updated_at", { ascending: false }).limit(1);
    if (entities.trackingCode) query = db.from("orders").select("order_code, status, marketplace_kind, updated_at").eq("customer_id", userId).eq("order_code", entities.trackingCode).limit(1);
    const { data, error } = await query.maybeSingle<{ order_code: string | null; status: string; marketplace_kind: string | null; updated_at: string | null }>();
    if (error) return { name: "get_order_details", answer: "I could not retrieve your order status right now. Please try again shortly.", deliveryCode: null, orderCode: null };
    if (!data) return { name: "get_order_details", answer: "I could not find a matching order in your account. Check the order code or open your Orders tab.", deliveryCode: null, orderCode: null };
    const reference = data.order_code || "order";
    const kind = data.marketplace_kind ? ` (${String(data.marketplace_kind).replaceAll("_", " ")})` : "";
    return { name: "get_order_details", answer: `Your ${reference}${kind} is currently ${String(data.status).replaceAll("_", " ")}.`, deliveryCode: null, orderCode: data.order_code || null };
  }
  if (intent === "restaurant_discovery") return { name: "search_restaurants", answer: await restaurantSummary(db), deliveryCode: null, orderCode: null };
  if (intent === "shopping_enquiry") return { name: "search_products", answer: await shoppingSummary(db), deliveryCode: null, orderCode: null };
  return null;
}

async function restaurantSummary(db: SupabaseClient) {
  const { data } = await db.from("platform_settings").select("value").eq("key", restaurantMenuSettingsKey).maybeSingle<{ value?: unknown }>();
  const kitchens = normalizeRestaurantKitchens(data?.value || defaultRestaurantKitchens).filter(kitchen => kitchen.operatingStatus !== "closed").slice(0, 5);
  return kitchens.length ? `Available restaurant options include: ${kitchens.map(kitchen => `${kitchen.name} in ${kitchen.area}`).join("; ")}. Open Restaurants to view current menus and availability.` : "Restaurant listings are unavailable right now. Please open Restaurants to try again.";
}

async function shoppingSummary(db: SupabaseClient) {
  const { data } = await db.from("platform_settings").select("value").eq("key", mallMenuSettingsKey).maybeSingle<{ value?: unknown }>();
  const malls = normalizeShoppingMalls(data?.value || defaultShoppingMalls);
  const categories = [...new Set(malls.flatMap(mall => mall.stores.map(store => store.category)))].slice(0, 5);
  return categories.length ? `You can browse ${categories.join(", ")} from listed shopping vendors. Open Shopping to view current products, availability and prices.` : "Shopping listings are unavailable right now. Please open Shopping to try again.";
}

function deterministic(answer: string, parsed: ReturnType<typeof classifyCustomerIntent>, responseKind: CustomerIntelligenceResult["responseKind"]): CustomerIntelligenceResult {
  return { answer, intent: parsed.intent, entities: parsed.entities, tools: [], provider: "deterministic", providerModel: null, mode: "deterministic_fallback", responseKind, context: { previousIntent: parsed.intent }, providerFailureCategory: null };
}
