import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const reviewerRoles = new Set(["customer", "rider", "business"]);
const subjectTypes = new Set(["customer_delivery", "rider_delivery", "business_order"]);

type SupabaseLike = {
  from: (table: string) => any;
};

function makeReviewKey(userId: string, subjectType: string, subjectId: string) {
  return `${userId}:${subjectType}:${subjectId}`;
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function userCanReviewDelivery(db: SupabaseLike, userId: string, deliveryId: string) {
  const { data: deliveryRow, error } = await db.from("deliveries").select("id, customer_id, rider_id, status").eq("id", deliveryId).maybeSingle();
  const delivery = deliveryRow as {
    id: string;
    customer_id: string;
    rider_id: string | null;
    status: string;
  } | null;
  if (error || !delivery || delivery.status !== "delivered") return false;
  if (delivery.customer_id === userId) return true;
  if (!delivery.rider_id) return false;
  const { data: riderRow } = await db.from("rider_profiles").select("user_id").eq("id", delivery.rider_id).maybeSingle();
  const rider = riderRow as { user_id: string } | null;
  return rider?.user_id === userId;
}

async function userCanReviewOrder(db: SupabaseLike, userId: string, orderId: string) {
  const { data: orderRow, error } = await db.from("orders").select("id, customer_id, business_id, business_profile_id, status").eq("id", orderId).maybeSingle();
  const order = orderRow as {
    id: string;
    customer_id: string;
    business_id: string | null;
    business_profile_id: string | null;
    status: string;
  } | null;
  if (error || !order || order.status !== "delivered") return false;
  if (order.customer_id === userId || order.business_id === userId) return true;
  if (!order.business_profile_id) return false;
  const { data: businessRow } = await db.from("business_profiles").select("user_id").eq("id", order.business_profile_id).maybeSingle();
  const business = businessRow as { user_id: string } | null;
  return business?.user_id === userId;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const url = new URL(request.url);
  const subjectType = url.searchParams.get("subjectType") || "";
  const subjectId = url.searchParams.get("deliveryId") || url.searchParams.get("orderId") || "";
  if (!subjectTypes.has(subjectType) || !subjectId) return NextResponse.json({ error: "Missing review subject." }, { status: 400 });

  const uniqueReviewKey = makeReviewKey(user.id, subjectType, subjectId);
  const { data, error } = await supabase.from("reviews").select("id").eq("unique_review_key", uniqueReviewKey).maybeSingle<{ id: string }>();
  if (error) return NextResponse.json({ exists: false, error: error.message }, { status: 400 });
  return NextResponse.json({ exists: Boolean(data?.id) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.reviewCreate);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const reviewerRole = String(body.reviewerRole || "");
  const subjectType = String(body.subjectType || "");
  const deliveryId = body.deliveryId ? String(body.deliveryId) : null;
  const orderId = body.orderId ? String(body.orderId) : null;
  const rating = Number(body.rating);
  const improvementNote = String(body.improvementNote || "").trim();
  const subjectId = orderId || deliveryId || "";

  if (!reviewerRoles.has(reviewerRole) || !subjectTypes.has(subjectType)) {
    return NextResponse.json({ error: "Choose a valid review type." }, { status: 400 });
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "Choose a rating from 1 to 5." }, { status: 400 });
  }
  if (!subjectId) return NextResponse.json({ error: "Missing delivery or order." }, { status: 400 });

  const admin = createAdminClient();
  const db = admin || supabase;
  const allowed = orderId ? await userCanReviewOrder(db, user.id, orderId) : deliveryId ? await userCanReviewDelivery(db, user.id, deliveryId) : false;
  if (!allowed) return NextResponse.json({ error: "You can only review your own completed order or delivery." }, { status: 403 });

  const uniqueReviewKey = makeReviewKey(user.id, subjectType, subjectId);
  const metadata = asObject(body.metadata);
  const reviewPayload = {
    unique_review_key: uniqueReviewKey,
    reviewer_id: user.id,
    reviewer_role: reviewerRole,
    subject_type: subjectType,
    delivery_id: deliveryId,
    order_id: orderId,
    target_user_id: body.targetUserId ? String(body.targetUserId) : null,
    target_profile_id: body.targetProfileId ? String(body.targetProfileId) : null,
    target_rider_profile_id: body.targetRiderProfileId ? String(body.targetRiderProfileId) : null,
    target_business_profile_id: body.targetBusinessProfileId ? String(body.targetBusinessProfileId) : null,
    rating,
    improvement_note: rating <= 3 ? improvementNote || null : null,
    metadata
  };

  const { data, error } = await db.from("reviews").upsert(reviewPayload, { onConflict: "unique_review_key" }).select("id, rating").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (admin && reviewPayload.target_rider_profile_id) {
    const { data: ratings } = await admin
      .from("reviews")
      .select("rating")
      .eq("target_rider_profile_id", reviewPayload.target_rider_profile_id)
      .limit(500);
    const values = (ratings || []).map((item) => Number(item.rating)).filter((value) => Number.isFinite(value));
    if (values.length) {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      await admin.from("rider_profiles").update({ rating: Number(average.toFixed(2)) }).eq("id", reviewPayload.target_rider_profile_id);
    }
  }

  return NextResponse.json({ review: data });
}
