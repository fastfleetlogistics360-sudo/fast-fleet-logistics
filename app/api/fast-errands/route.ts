import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ errands: [] });
  const { data, error } = await db.from("fast_errand_orders").select("id, errand_code, vendor_name, purchase_budget_ngn, actual_purchase_ngn, status, top_up_required_ngn, created_at").eq("customer_id", user.id).in("status", ["funded_waiting_admin", "top_up_required", "vendor_funded"]).order("created_at", { ascending: false }).limit(10);
  if (error) return NextResponse.json({ error: "Could not load FastErrands." }, { status: 500 });
  return NextResponse.json({ errands: data || [] });
}
