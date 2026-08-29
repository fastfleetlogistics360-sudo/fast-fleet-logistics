import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ errands: [] });
  const { data, error } = await db.from("orders").select("id, order_code, business_profile_id, amount, status, created_at, business_profiles(business_name)").eq("customer_id", user.id).eq("marketplace_kind", "fast_errands").neq("payment_status", "pending").order("created_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: "Could not load FastErrands." }, { status: 500 });
  const errands = (data || []).map((order: { id: string; order_code?: string | null; amount?: number | null; status?: string | null; created_at: string; business_profiles?: Array<{ business_name?: string | null }> | null }) => ({ id: order.id, errand_code: order.order_code || order.id, vendor_name: order.business_profiles?.[0]?.business_name || "FastErrands", status: order.status || "received", customer_total_ngn: Number(order.amount || 0), created_at: order.created_at }));
  return NextResponse.json({ errands });
}
