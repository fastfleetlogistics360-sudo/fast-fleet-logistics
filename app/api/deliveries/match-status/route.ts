import { NextResponse } from "next/server";
import { customerVehicleOptionForLegacyVehicle } from "@/lib/customer-vehicle-options";
import { createClient } from "@/lib/supabase/server";
import type { VehicleType } from "@/types/domain";

export async function GET(request: Request) {
  try {
    const deliveryId = new URL(request.url).searchParams.get("deliveryId") || "";
    if (!deliveryId) return NextResponse.json({ error: "Delivery is required." }, { status: 400 });
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    const { data, error } = await supabase
      .from("deliveries")
      .select("id, delivery_code, status, vehicle_type, vehicle_subtype, rider_id, metadata")
      .eq("id", deliveryId)
      .eq("customer_id", user.id)
      .maybeSingle<{ id: string; delivery_code: string; status: string; vehicle_type: VehicleType; vehicle_subtype?: string | null; rider_id?: string | null; metadata?: Record<string, unknown> | null }>();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Delivery not found." }, { status: 404 });
    const savedOption = String(data.metadata?.customer_vehicle_option || "");
    const option = savedOption || customerVehicleOptionForLegacyVehicle(data.vehicle_type, data.vehicle_subtype)?.id || "motorcycle";
    return NextResponse.json({
      id: data.id,
      deliveryCode: data.delivery_code,
      status: data.status,
      riderAssigned: Boolean(data.rider_id),
      vehicleOption: option
    });
  } catch {
    return NextResponse.json({ error: "Could not check rider matching status." }, { status: 500 });
  }
}
