import type { SupabaseClient } from "@supabase/supabase-js";
import { sendWhatsAppImage, sendWhatsAppText } from "@/lib/whatsapp/messages";
import { metadataRecord, pickupProofFromMetadata } from "@/lib/pickup-proof";
import { PICKUP_PROOF_MAX_REJECTIONS, pickupProofRejectionCount } from "@/lib/pickup-proof";
import { insertNotificationWithPush } from "@/lib/notifications/push";

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

/** Sends lifecycle updates only for WhatsApp-originated deliveries. Metadata records sent events so retries do not duplicate messages. */
export async function notifyWhatsAppDeliveryUpdate(db: SupabaseClient, deliveryId: string, event: "accepted" | "rider_arrived" | "picked_up" | "in_transit" | "awaiting_delivery_confirmation" | "fastconfirm" | "delivered") {
  const { data, error } = await db.from("deliveries").select(deliverySelect).eq("id", deliveryId).maybeSingle<DeliveryRow>();
  if (error) throw error;
  if (!data) return false;
  const metadata = metadataRecord(data.metadata);
  const phone = text(metadata.whatsapp_phone);
  if ((metadata.source !== "whatsapp_ordering" && metadata.whatsapp_order_source !== true) || !phone) return false;
  const sent = metadata.whatsapp_delivery_updates && typeof metadata.whatsapp_delivery_updates === "object" && !Array.isArray(metadata.whatsapp_delivery_updates) ? metadata.whatsapp_delivery_updates as Record<string, string> : {};
  const proof = event === "fastconfirm" ? pickupProofFromMetadata(data.metadata) : null;
  // A rejected FastConfirm can be replaced with a fresh photo. Treat each
  // upload attempt as a separate message, while all other status updates stay
  // idempotent.
  const eventKey = event === "fastconfirm" ? `${event}:${String(proof?.attempt || proof?.path || "first")}` : event;
  if (sent[eventKey]) return true;
  const body = deliveryMessage(event, data, data.delivery_code || data.id);
  if (event === "fastconfirm") {
    const path = text(proof?.path);
    if (path) {
      const signed = await db.storage.from("delivery-proofs").createSignedUrl(path, 15 * 60);
      if (!signed.error && signed.data?.signedUrl) {
        await sendWhatsAppImage({ to: phone, imageUrl: signed.data.signedUrl, caption: body });
      } else {
        await sendWhatsAppText({ to: phone, body });
      }
    } else {
      await sendWhatsAppText({ to: phone, body });
    }
  } else {
    await sendWhatsAppText({ to: phone, body });
  }
  // Re-read before adding the sent marker: the customer may have replied to a
  // FastConfirm image while Meta was receiving it, and that reply updates the
  // same JSON metadata record.
  const { data: latest, error: latestError } = await db.from("deliveries").select("metadata").eq("id", data.id).maybeSingle<{ metadata?: Record<string, unknown> | null }>();
  if (latestError) throw latestError;
  const latestMetadata = metadataRecord(latest?.metadata);
  const latestSent = latestMetadata.whatsapp_delivery_updates && typeof latestMetadata.whatsapp_delivery_updates === "object" && !Array.isArray(latestMetadata.whatsapp_delivery_updates)
    ? latestMetadata.whatsapp_delivery_updates as Record<string, string>
    : {};
  if (latestSent[eventKey]) return true;
  const { error: updateError } = await db.from("deliveries").update({ metadata: { ...latestMetadata, whatsapp_delivery_updates: { ...latestSent, [eventKey]: new Date().toISOString() } }, updated_at: new Date().toISOString() }).eq("id", data.id);
  if (updateError) throw updateError;
  return true;
}

export async function whatsappDeliveryForPhone(db: SupabaseClient, phone: string, statuses: string[]) {
  const { data, error } = await db.from("deliveries").select("id, delivery_code, customer_id, rider_id, dropoff_contact, status, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)").contains("metadata", { whatsapp_phone: phone }).in("status", statuses).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Handles a WhatsApp customer's YES/NO response to a pending FastConfirm image. */
export async function handleWhatsAppFastConfirmReply(db: SupabaseClient, phone: string, userId: string, command: string) {
  if (command !== "YES" && command !== "NO") return null;
  const delivery = await whatsappDeliveryForPhone(db, phone, ["picked_up"]);
  if (!delivery) return null;
  const metadata = metadataRecord(delivery.metadata);
  // Marketplace business orders keep the shopper's identity in metadata while
  // the delivery itself belongs to the business account that fulfils it.
  const marketplaceCustomerId = text(metadata.marketplace_customer_id);
  if (delivery.customer_id !== userId && marketplaceCustomerId !== userId) return null;
  const proof = pickupProofFromMetadata(metadata);
  if (!proof?.url || proof.status !== "pending") return null;
  const riderProfile = Array.isArray(delivery.rider_profiles) ? delivery.rider_profiles[0] : delivery.rider_profiles;
  const timestamp = new Date().toISOString();
  const accepted = command === "YES";
  const rejectionCount = accepted ? pickupProofRejectionCount(proof) : pickupProofRejectionCount(proof) + 1;
  const canContinue = accepted || rejectionCount >= PICKUP_PROOF_MAX_REJECTIONS;
  const nextProof = accepted
    ? { ...proof, status: "approved", reviewed_at: timestamp, approved_by: userId, can_continue: true, note: null }
    : { ...proof, status: "rejected", reviewed_at: timestamp, rejected_by: userId, rejection_count: rejectionCount, can_continue: canContinue, flagged_at: canContinue ? timestamp : proof.flagged_at || null, note: canContinue ? "Customer rejected the package photo twice. Support review is flagged; rider may continue if pickup is correct." : "Customer rejected this package photo." };
  const { error } = await db.from("deliveries").update({ metadata: { ...metadata, pickup_proof: nextProof, pickup_proof_required: true }, updated_at: timestamp }).eq("id", delivery.id);
  if (error) throw error;
  await Promise.allSettled([
    db.from("delivery_events").insert({ delivery_id: delivery.id, actor_id: userId, status: "picked_up", title: accepted ? "Package photo confirmed in WhatsApp" : "Package photo rejected in WhatsApp", body: accepted ? "Customer replied YES to FastConfirm in WhatsApp." : canContinue ? "Customer replied NO twice to FastConfirm in WhatsApp. Support review is flagged." : "Customer replied NO to FastConfirm in WhatsApp. Rider must upload another photo." }),
    riderProfile?.user_id ? insertNotificationWithPush(db, { user_id: riderProfile.user_id, title: accepted ? "FastConfirm accepted" : "FastConfirm rejected", body: accepted ? `${delivery.delivery_code || "Delivery"} package was accepted in WhatsApp. You can start the trip.` : canContinue ? `${delivery.delivery_code || "Delivery"} was rejected twice in WhatsApp. Support is flagged; continue only if correct.` : `${delivery.delivery_code || "Delivery"} package was rejected in WhatsApp. Upload another photo.`, type: "package_confirmation", metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code || delivery.id, status: nextProof.status, url: "/rider/dashboard", tag: `ff-rider-${delivery.delivery_code || delivery.id}` } }) : Promise.resolve()
  ]);
  return accepted ? `FastConfirm accepted for ${delivery.delivery_code || "your order"}. Your rider can now start the trip.` : canContinue ? `Your FastConfirm concern has been recorded for ${delivery.delivery_code || "your order"}. Support has been alerted while the rider verifies the pickup.` : `FastConfirm rejected for ${delivery.delivery_code || "your order"}. The rider has been asked to upload a new package photo.`;
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
  if (event === "picked_up") return `${code} update: your order has been collected. We will confirm the package before the trip starts.`;
  if (event === "in_transit") return `${code} update: ${riderName} is on the way to your delivery address.`;
  if (event === "awaiting_delivery_confirmation") return `${code} update: ${riderName} has arrived at your delivery address. Please complete the delivery confirmation when the package is handed to you.`;
  if (event === "fastconfirm") return `FastConfirm™ for ${code}\n\nYour rider uploaded a package photo for review. Reply YES to accept the package or NO if it is not correct. Reply within 3 minutes, otherwise the rider can continue automatically.`;
  return `${code} is complete. Thank you for using Fast Fleets 360.`;
}

function vehicleLabel(value: unknown) { const vehicle = text(value).toLowerCase(); return vehicle === "van" ? "Van" : vehicle === "car" ? "Car" : "Bike"; }
function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
