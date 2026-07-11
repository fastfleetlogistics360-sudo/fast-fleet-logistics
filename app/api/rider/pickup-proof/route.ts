import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import {
  PICKUP_PROOF_MAX_REJECTIONS,
  PICKUP_PROOF_REVIEW_WINDOW_MS,
  isCustomerPickupProofRequired,
  metadataRecord,
  pickupProofFromMetadata,
  pickupProofRejectionCount
} from "@/lib/pickup-proof";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountMessengerHref } from "@/lib/tracking-links";

export const runtime = "nodejs";

const maxUploadSize = 7 * 1024 * 1024;

const jobSelect =
  "id, delivery_code, pickup_address, pickup_latitude, pickup_longitude, pickup_contact, dropoff_address, dropoff_contact, status, price_ngn, distance_km, eta_minutes, created_at, proof_url, rider_id, vehicle_type, metadata, users:users!deliveries_customer_id_fkey(full_name, phone, email, avatar_url)";

type DeliveryForProof = {
  id: string;
  delivery_code?: string | null;
  customer_id?: string | null;
  rider_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
};

type RiderProfile = {
  id: string;
  user_id: string;
};

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.riderJobsWrite, name: "rider:pickup-proof" });
    if (limited) return limited;

    const formData = await request.formData().catch(() => null);
    const deliveryId = String(formData?.get("deliveryId") || "").trim();
    const file = formData?.get("file");

    if (!deliveryId) return NextResponse.json({ error: "Choose a delivery before uploading package proof." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Attach a package photo before uploading." }, { status: 400 });
    if (!file.type.startsWith("image/")) return NextResponse.json({ error: "Package proof must be an image." }, { status: 400 });
    if (file.size > maxUploadSize) return NextResponse.json({ error: "Image is too large. Upload a photo under 7 MB." }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in as a rider." }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Package photo uploads are not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
    }

    const { data: rider, error: riderError } = await admin
      .from("rider_profiles")
      .select("id, user_id")
      .eq("user_id", user.id)
      .maybeSingle<RiderProfile>();
    if (riderError) throw riderError;
    if (!rider?.id) return NextResponse.json({ error: "Rider profile not found." }, { status: 404 });

    const { data: delivery, error: deliveryError } = await admin
      .from("deliveries")
      .select("id, delivery_code, customer_id, rider_id, status, metadata")
      .eq("id", deliveryId)
      .maybeSingle<DeliveryForProof>();
    if (deliveryError) throw deliveryError;
    if (!delivery?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    if (delivery.rider_id !== rider.id) return NextResponse.json({ error: "Only the assigned rider can upload this package photo." }, { status: 403 });
    if (delivery.status !== "picked_up") return NextResponse.json({ error: "Package photo is only needed after pickup is marked collected." }, { status: 409 });
    if (!isCustomerPickupProofRequired(delivery.metadata)) {
      return NextResponse.json({ error: "Package confirmation is only required for regular customer deliveries." }, { status: 400 });
    }

    const metadata = metadataRecord(delivery.metadata);
    const previousProof = pickupProofFromMetadata(metadata);
    const rejectionCount = pickupProofRejectionCount(previousProof);
    const timestamp = new Date();
    const uploadedAt = timestamp.toISOString();
    const expiresAt = new Date(timestamp.getTime() + PICKUP_PROOF_REVIEW_WINDOW_MS).toISOString();
    const safeName = sanitizeFileName(file.name || "package-photo.jpg");
    const path = `${rider.id}/pickup-${delivery.id}-${Date.now()}-${safeName}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const upload = await uploadObject(admin, "delivery-proofs", path, bytes, file.type || "image/jpeg", true);
    if (upload.error) return NextResponse.json({ error: friendlyUploadError(upload.error.message) }, { status: 500 });

    const { data: publicUrl } = admin.storage.from("delivery-proofs").getPublicUrl(path);
    const nextProof = {
      url: publicUrl.publicUrl,
      path,
      bucket: "delivery-proofs",
      status: "pending",
      uploaded_at: uploadedAt,
      expires_at: expiresAt,
      reviewed_at: null,
      approved_by: null,
      rejected_by: null,
      rejection_count: rejectionCount,
      can_continue: false,
      attempt: Number(previousProof?.attempt || 0) + 1,
      note: rejectionCount >= PICKUP_PROOF_MAX_REJECTIONS ? "Customer rejection limit already reached. Support review remains attached." : null,
      history: compactProofHistory(previousProof)
    };

    const nextMetadata = {
      ...metadata,
      pickup_proof_required: true,
      pickup_proof: nextProof
    };

    const { error: updateError } = await admin
      .from("deliveries")
      .update({ metadata: nextMetadata, updated_at: uploadedAt })
      .eq("id", delivery.id);
    if (updateError) throw updateError;

    await Promise.allSettled([
      admin.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "picked_up",
        title: "Package photo uploaded",
        body: "Rider uploaded a package photo for customer confirmation."
      }),
      delivery.customer_id
        ? insertNotificationWithPush(admin, {
            user_id: delivery.customer_id,
            title: "Confirm your package",
            body: `${delivery.delivery_code || "Your delivery"} has a package photo waiting for your confirmation.`,
            type: "package_confirmation",
            metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code || "", status: "pending", url: accountMessengerHref(delivery.delivery_code || delivery.id), tag: `ff-${delivery.delivery_code || delivery.id}` }
          })
        : Promise.resolve()
    ]);

    return updateResponse(admin, delivery.id);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not upload package proof." }, { status: 500 });
  }
}

async function updateResponse(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("deliveries").select(jobSelect).eq("id", id).single();
  if (error) throw error;
  return NextResponse.json({ job: data });
}

async function uploadObject(db: SupabaseClient, bucket: string, objectPath: string, body: Buffer, contentType: string, publicBucket: boolean) {
  const attempt = await db.storage.from(bucket).upload(objectPath, body, {
    cacheControl: "31536000",
    contentType,
    upsert: true
  });

  if (!isMissingBucketError(attempt.error?.message)) return attempt;

  const create = await db.storage.createBucket(bucket, { public: publicBucket });
  if (create.error && !/already exists/i.test(create.error.message)) return { data: null, error: create.error };

  return db.storage.from(bucket).upload(objectPath, body, {
    cacheControl: "31536000",
    contentType,
    upsert: true
  });
}

function compactProofHistory(previousProof: ReturnType<typeof pickupProofFromMetadata>) {
  if (!previousProof?.url) return [];
  const previousHistory = Array.isArray(previousProof.history) ? previousProof.history : [];
  return [
    ...previousHistory.slice(-4),
    {
      url: previousProof.url,
      status: previousProof.status || null,
      uploaded_at: previousProof.uploaded_at || null,
      reviewed_at: previousProof.reviewed_at || null
    }
  ];
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "package-photo.jpg";
}

function isMissingBucketError(message?: string) {
  return Boolean(message && /bucket.*not.*found|not found/i.test(message));
}

function friendlyUploadError(message: string) {
  if (/schema is invalid|incompatible|schema.*cache|column.*does not exist/i.test(message)) {
    return "Supabase Storage rejected this image because the storage schema is not ready. Re-run the Supabase schema, then try again.";
  }
  return message || "Package photo upload failed. Try again.";
}
