import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppText } from "@/lib/whatsapp/messages";
import { metadataRecord } from "@/lib/pickup-proof";
import { deliveryConfirmationOwnerIds, type DeliveryConfirmationTarget } from "@/lib/delivery-confirmation";

type DeliveryRow = {
  id: string;
  delivery_code?: string | null;
  eta_minutes?: number | string | null;
  vehicle_type?: string | null;
  vehicle_subtype?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_profiles?: { plate_number?: string | null; vehicle_type?: string | null; vehicle_color?: string | null; users?: { full_name?: string | null; phone?: string | null } | null } | null;
};

const deliverySelect = "id, delivery_code, eta_minutes, vehicle_type, vehicle_subtype, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(plate_number, vehicle_type, vehicle_color, users:users!rider_profiles_user_id_fkey(full_name, phone))";

/** Sends lifecycle updates only for WhatsApp-originated deliveries. */
export async function notifyWhatsAppDeliveryUpdate(db: SupabaseClient, deliveryId: string, event: "accepted" | "rider_arrived" | "picked_up" | "in_transit" | "awaiting_delivery_confirmation" | "delivered") {
  const { data, error } = await db.from("deliveries").select(deliverySelect).eq("id", deliveryId).maybeSingle<DeliveryRow>();
  if (error) throw error;
  if (!data) return false;
  const metadata = metadataRecord(data.metadata);
  const phone = text(metadata.whatsapp_phone);
  if ((metadata.source !== "whatsapp_ordering" && metadata.whatsapp_order_source !== true) || !phone) return false;
  const sent = metadata.whatsapp_delivery_updates && typeof metadata.whatsapp_delivery_updates === "object" && !Array.isArray(metadata.whatsapp_delivery_updates) ? metadata.whatsapp_delivery_updates as Record<string, string> : {};
  if (sent[event]) return true;

  await sendWhatsAppText({ to: phone, body: deliveryMessage(event, data, data.delivery_code || data.id) });
  const { data: latest, error: latestError } = await db.from("deliveries").select("metadata").eq("id", data.id).maybeSingle<{ metadata?: Record<string, unknown> | null }>();
  if (latestError) throw latestError;
  const latestMetadata = metadataRecord(latest?.metadata);
  const latestSent = latestMetadata.whatsapp_delivery_updates && typeof latestMetadata.whatsapp_delivery_updates === "object" && !Array.isArray(latestMetadata.whatsapp_delivery_updates)
    ? latestMetadata.whatsapp_delivery_updates as Record<string, string>
    : {};
  if (latestSent[event]) return true;
  const { error: updateError } = await db.from("deliveries").update({ metadata: { ...latestMetadata, whatsapp_delivery_updates: { ...latestSent, [event]: new Date().toISOString() } }, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (updateError) throw updateError;
  return true;
}

export async function whatsappDeliveryForPhone(db: SupabaseClient, phone: string, statuses: string[]) {
  const { data, error } = await db.from("deliveries").select("id, delivery_code, customer_id, rider_id, dropoff_contact, status, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)").contains("metadata", { whatsapp_phone: phone }).in("status", statuses).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Identifies a secure delivery-handover instruction from the linked WhatsApp customer. */
export async function handleWhatsAppDeliveryConfirmationReply(db: SupabaseClient, phone: string, userId: string, command: string) {
  const action = command === "DELIVERED" || command === "CONFIRM DELIVERY" ? "confirm" : command === "RESEND PIN" ? "resend" : null;
  if (!action) return null;
  const delivery = await whatsappDeliveryForPhone(db, phone, ["awaiting_delivery_confirmation"]);
  if (!delivery || !deliveryConfirmationOwnerIds(delivery as DeliveryConfirmationTarget).includes(userId)) return null;
  return { action, delivery };
}

function deliveryMessage(event: Parameters<typeof notifyWhatsAppDeliveryUpdate>[2], delivery: DeliveryRow, code: string) {
  const rider = delivery.rider_profiles;
  const riderName = text(rider?.users?.full_name) || "your Fast Fleets rider";
  const vehicle = delivery.vehicle_subtype === "bicycle" ? "Bicycle" : vehicleLabel(rider?.vehicle_type || delivery.vehicle_type);
  const eta = Number(delivery.eta_minutes || 0);
  if (event === "accepted") {
    const details = [rider?.vehicle_color, rider?.plate_number].filter(Boolean).join(" · ");
    return `Rider found for ${code}.\n\n${riderName} has accepted your order.\nVehicle: ${vehicle}${details ? ` (${details})` : ""}${eta ? `\nEstimated delivery: about ${eta} minutes.` : ""}\n\nWe will send every progress update here.`;
  }
  if (event === "rider_arrived") return `${code} update: ${riderName} has arrived at the pickup point.`;
  if (event === "picked_up") return `${code} update: your order has been collected. Your rider is preparing to start the trip.`;
  if (event === "in_transit") return `${code} update: ${riderName} is on the way to your delivery address.`;
  if (event === "awaiting_delivery_confirmation") return `${code} update: ${riderName} has arrived at your delivery address. Please complete the delivery confirmation when the package is handed to you.`;
  return `${code} is complete. Thank you for using Fast Fleets 360.`;
}

function vehicleLabel(value: unknown) { const vehicle = text(value).toLowerCase(); return vehicle === "van" ? "Van" : vehicle === "car" ? "Car" : "Bike"; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
