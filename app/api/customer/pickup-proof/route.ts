import { NextResponse } from "next/server";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import {
  PICKUP_PROOF_MAX_REJECTIONS,
  metadataRecord,
  pickupProofFromMetadata,
  pickupProofRejectionCount,
  pickupProofReviewExpired
} from "@/lib/pickup-proof";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountMessengerHref } from "@/lib/tracking-links";

type ReviewPayload = {
  deliveryId?: string;
  decision?: "approve" | "reject";
};

type DeliveryForReview = {
  id: string;
  delivery_code?: string | null;
  customer_id?: string | null;
  rider_id?: string | null;
  status?: string | null;
  metadata?: Record<string, unknown> | null;
  rider_profiles?: { user_id?: string | null } | null;
};

export async function POST(request: Request) {
  try {
    const limited = await enforceRateLimit(request, { name: "customer:pickup-proof", limit: 20, windowSeconds: 60 });
    if (limited) return limited;

    const payload = (await request.json().catch(() => ({}))) as ReviewPayload;
    const deliveryId = String(payload.deliveryId || "").trim();
    const decision = payload.decision;
    if (!deliveryId || (decision !== "approve" && decision !== "reject")) {
      return NextResponse.json({ error: "Choose a delivery and confirmation response." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to confirm your package." }, { status: 401 });

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Package confirmation is not configured." }, { status: 503 });

    const { data: delivery, error: deliveryError } = await admin
      .from("deliveries")
      .select("id, delivery_code, customer_id, rider_id, status, metadata, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)")
      .eq("id", deliveryId)
      .maybeSingle<DeliveryForReview>();
    if (deliveryError) throw deliveryError;
    if (!delivery?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    if (delivery.customer_id !== user.id) return NextResponse.json({ error: "Only the customer who booked this delivery can confirm the package." }, { status: 403 });

    const metadata = metadataRecord(delivery.metadata);
    const proof = pickupProofFromMetadata(metadata);
    if (!proof?.url) return NextResponse.json({ error: "No package photo is available yet." }, { status: 409 });
    if (proof.status !== "pending") return NextResponse.json({ pickup_proof: proof });

    const timestamp = new Date().toISOString();
    const nextProof = pickupProofReviewExpired(proof)
      ? {
          ...proof,
          status: "auto_approved" as const,
          reviewed_at: timestamp,
          can_continue: true,
          note: "Customer review window expired."
        }
      : decision === "approve"
        ? {
            ...proof,
            status: "approved" as const,
            reviewed_at: timestamp,
            approved_by: user.id,
            can_continue: true,
            note: null
          }
        : rejectionPatch(proof, user.id, timestamp);

    const nextMetadata = { ...metadata, pickup_proof: nextProof, pickup_proof_required: true };
    const { error: updateError } = await admin.from("deliveries").update({ metadata: nextMetadata, updated_at: timestamp }).eq("id", delivery.id);
    if (updateError) throw updateError;

    const rejected = nextProof.status === "rejected";
    await Promise.allSettled([
      admin.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "picked_up",
        title: rejected ? "Package photo rejected" : "Package photo confirmed",
        body: rejected
          ? nextProof.can_continue
            ? "Customer rejected the package photo after the rejection limit. Support review is flagged and rider can continue if pickup is correct."
            : "Customer rejected the package photo. Rider must upload a new photo."
          : "Customer confirmed the package photo."
      }),
      delivery.rider_profiles?.user_id
        ? insertNotificationWithPush(admin, {
            user_id: delivery.rider_profiles.user_id,
            title: rejected ? "Package photo rejected" : "Package photo confirmed",
            body: rejected
              ? nextProof.can_continue
                ? `${delivery.delivery_code || "Delivery"} was disputed twice. Support review is flagged; continue only if the package is correct.`
                : `${delivery.delivery_code || "Delivery"} package photo was rejected. Upload a new package photo.`
              : `${delivery.delivery_code || "Delivery"} package photo was confirmed. You can start the trip.`,
            type: "package_confirmation",
            metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code || "", status: nextProof.status || "", url: "/rider/dashboard", customer_url: accountMessengerHref(delivery.delivery_code || delivery.id), tag: `ff-rider-${delivery.delivery_code || delivery.id}` }
          })
        : Promise.resolve()
    ]);

    return NextResponse.json({ pickup_proof: nextProof });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not review package photo." }, { status: 500 });
  }
}

function rejectionPatch(proof: NonNullable<ReturnType<typeof pickupProofFromMetadata>>, userId: string, timestamp: string) {
  const rejectionCount = pickupProofRejectionCount(proof) + 1;
  const canContinue = rejectionCount >= PICKUP_PROOF_MAX_REJECTIONS;
  return {
    ...proof,
    status: "rejected" as const,
    reviewed_at: timestamp,
    rejected_by: userId,
    rejection_count: rejectionCount,
    can_continue: canContinue,
    flagged_at: canContinue ? timestamp : proof.flagged_at || null,
    note: canContinue
      ? "Customer rejection limit reached. Support review is flagged and rider is not blocked from continuing."
      : "Customer rejected this package photo."
  };
}
