import { NextResponse } from "next/server";
import { customerVehicleOptionForLegacyVehicle } from "@/lib/customer-vehicle-options";
import { accountMessengerHref } from "@/lib/tracking-links";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { VehicleType } from "@/types/domain";

export async function GET(request: Request) {
  try {
    const deliveryId = new URL(request.url).searchParams.get("deliveryId") || "";
    const matchToken = new URL(request.url).searchParams.get("matchToken") || "";
    if (!deliveryId) return NextResponse.json({ error: "Delivery is required." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const admin = createAdminClient();
    if (!admin) return NextResponse.json({ error: "Rider matching is temporarily unavailable." }, { status: 503 });
    const { data, error } = await admin
      .from("deliveries")
      .select("id, delivery_code, status, vehicle_type, vehicle_subtype, rider_id, metadata")
      .eq("id", deliveryId)
      .maybeSingle<{ id: string; delivery_code: string; status: string; vehicle_type: VehicleType; vehicle_subtype?: string | null; rider_id?: string | null; metadata?: Record<string, unknown> | null }>();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    const tokenMatches = Boolean(matchToken) && matchToken === String(data.metadata?.customer_match_token || "");
    if (!user && !tokenMatches) return NextResponse.json({ error: "Please reopen this delivery from your Fast Fleets account." }, { status: 401 });
    if (user && !tokenMatches) {
      const { data: owned } = await supabase.from("deliveries").select("id").eq("id", deliveryId).eq("customer_id", user.id).maybeSingle<{ id: string }>();
      if (!owned?.id) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    }
    const savedOption = String(data.metadata?.customer_vehicle_option || "");
    const option = savedOption || customerVehicleOptionForLegacyVehicle(data.vehicle_type, data.vehicle_subtype)?.id || "motorcycle";
    return NextResponse.json({
      id: data.id,
      deliveryCode: data.delivery_code,
      status: data.status,
      riderAssigned: Boolean(data.rider_id),
      vehicleOption: option,
      messengerHref: accountMessengerHref(data.delivery_code)
    });
  } catch {
    return NextResponse.json({ error: "Could not check rider matching status." }, { status: 500 });
  }
}
