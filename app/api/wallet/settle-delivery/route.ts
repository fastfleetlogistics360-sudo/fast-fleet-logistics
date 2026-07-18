import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { creditRiderDeliveryWallet } from "@/lib/wallet-ledger";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const { deliveryId } = (await request.json().catch(() => ({}))) as { deliveryId?: string };
    const id = String(deliveryId || "").trim();
    if (!id) return NextResponse.json({ error: "Choose a delivered job to settle." }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to settle rider earnings." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.deliverySettlementRequest);
    if (limited) return limited;

    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Rider settlement is not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });

    const { data: delivery, error: deliveryError } = await admin
      .from("deliveries")
      .select("id, rider_id, status, rider_profiles:rider_profiles!deliveries_rider_id_fkey(user_id)")
      .eq("id", id)
      .maybeSingle<{ id: string; rider_id?: string | null; status?: string | null; rider_profiles?: { user_id?: string | null } | null }>();
    if (deliveryError) throw deliveryError;
    if (!delivery?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    if (delivery.rider_profiles?.user_id !== user.id) {
      return NextResponse.json({ error: "Only the assigned rider can settle this earning." }, { status: 403 });
    }
    if (delivery.status !== "delivered") return NextResponse.json({ error: "Delivery must be completed before rider earning is credited." }, { status: 400 });

    const result = await creditRiderDeliveryWallet(admin, id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not settle rider earning." }, { status: 500 });
  }
}
