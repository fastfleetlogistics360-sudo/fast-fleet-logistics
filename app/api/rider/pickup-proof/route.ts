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
import { persistReplacement, removeStoredObject, uploadValidatedObject } from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountMessengerHref } from "@/lib/tracking-links";
import {
  buildStoragePath,
  logUploadRejection,
  multipartBodyTooLarge,
  uploadErrorResponse,
  validateUpload,
  UploadSecurityError,
  type UploadRejectionCode
} from "@/lib/upload-security";

export const runtime = "nodejs";

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
  let userId: string | null = null;
  let claimedMime: string | null = null;
  let fileSize: number | null = null;
  try {
    const limited = await enforceRateLimit(request, rateLimitPolicies.uploadDeliveryProof);
    if (limited) {
      logUploadRejection({ route: "/api/rider/pickup-proof", code: "UPLOAD_RATE_LIMITED" });
      return limited;
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Please sign in as a rider.", { status: 401 });
    userId = user.id;
    if (multipartBodyTooLarge(request)) {
      throw new UploadSecurityError("UPLOAD_TOO_LARGE", "File is too large. Choose a file under 7 MB.");
    }

    const formData = await request.formData().catch(() => null);
    const deliveryId = String(formData?.get("deliveryId") || "").trim();
    const file = formData?.get("file");

    if (!deliveryId) return NextResponse.json({ error: "Choose a delivery before uploading package proof." }, { status: 400 });
    if (!(file instanceof File)) throw new UploadSecurityError("UPLOAD_EMPTY", "Attach a package photo before uploading.");
    claimedMime = file.type || null;
    fileSize = file.size;

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
    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = await validateUpload({ bytes, originalName: file.name, declaredMime: file.type, profile: "delivery-proof" });
    const path = buildStoragePath({ ownerId: user.id, profile: "delivery-proof", context: delivery.id, fileName: validated.fileName });
    const accessUrl = `/api/uploads/access?scope=delivery-proof&id=${encodeURIComponent(delivery.id)}`;
    const nextHistory = compactProofHistory(previousProof);
    const staleHistoryPaths = droppedProofHistoryPaths(previousProof, nextHistory);
    const nextProof = {
      url: accessUrl,
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
      history: nextHistory
    };

    const nextMetadata = {
      ...metadata,
      pickup_proof_required: true,
      pickup_proof: nextProof
    };

    await persistReplacement({
      uploadNew: () => uploadValidatedObject(admin, { bucket: "delivery-proofs", path, upload: validated, publicBucket: false }),
      persistNew: async () => {
        const { error: updateError } = await admin
          .from("deliveries")
          .update({ metadata: nextMetadata, updated_at: uploadedAt })
          .eq("id", delivery.id);
        if (updateError) throw updateError;
      },
      removeNew: (stored) => removeStoredObject(admin, stored.bucket, stored.path)
    });
    await Promise.allSettled(staleHistoryPaths.map((stalePath) => removeStoredObject(admin, "delivery-proofs", stalePath)));

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
    const result = uploadErrorResponse(error);
    const code = result.body.code as UploadRejectionCode;
    logUploadRejection({
      route: "/api/rider/pickup-proof",
      userId,
      claimedMime,
      detectedMime: error instanceof UploadSecurityError ? error.detectedMime : null,
      fileSize,
      code
    });
    return NextResponse.json(result.body, { status: result.status });
  }
}

async function updateResponse(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("deliveries").select(jobSelect).eq("id", id).single();
  if (error) throw error;
  return NextResponse.json({ job: data });
}

function compactProofHistory(previousProof: ReturnType<typeof pickupProofFromMetadata>) {
  if (!previousProof?.url) return [];
  const previousHistory = Array.isArray(previousProof.history) ? previousProof.history : [];
  return [
    ...previousHistory.slice(-4),
    {
      url: previousProof.url,
      path: previousProof.path || null,
      bucket: previousProof.bucket || "delivery-proofs",
      status: previousProof.status || null,
      uploaded_at: previousProof.uploaded_at || null,
      reviewed_at: previousProof.reviewed_at || null
    }
  ];
}

function droppedProofHistoryPaths(
  previousProof: ReturnType<typeof pickupProofFromMetadata>,
  retainedHistory: Array<Record<string, unknown>>
) {
  const retained = new Set(retainedHistory.map((entry) => String(entry.path || "")).filter(Boolean));
  const previousHistory = Array.isArray(previousProof?.history) ? previousProof.history : [];
  return previousHistory
    .map((entry) => String(entry.path || ""))
    .filter((path) => path && !retained.has(path));
}
