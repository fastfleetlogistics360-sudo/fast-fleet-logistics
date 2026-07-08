import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";

const demoReviews = [
  {
    id: "REV-1001",
    reviewer_role: "customer",
    subject_type: "customer_delivery",
    rating: 5,
    improvement_note: null,
    metadata: { delivery_code: "FF-DEMO-01" },
    created_at: new Date().toISOString()
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ reviews: demoReviews, demo: true });
    return NextResponse.json(missingServiceResponse("admin reviews"), { status: 503 });
  }

  const { data, error } = await supabase
    .from("reviews")
    .select("id, reviewer_role, subject_type, rating, improvement_note, metadata, created_at, delivery_id, order_id, target_rider_profile_id, target_business_profile_id")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ reviews: data || [] });
}
