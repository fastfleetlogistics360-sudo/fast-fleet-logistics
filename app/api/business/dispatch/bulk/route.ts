import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { estimateFare } from "@/lib/fare";
import type { VehicleType } from "@/types/domain";

type BulkRow = {
  sender_name?: string;
  sender_phone?: string;
  pickup_address?: string;
  recipient_name?: string;
  recipient_phone?: string;
  dropoff_address?: string;
  package_type?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { rows?: BulkRow[] };
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
    if (!rows.length) return NextResponse.json({ error: "Upload at least one valid dispatch row." }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before creating dispatches." }, { status: 401 });

    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("registration_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (businessProfile?.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before creating dispatches." }, { status: 403 });
    }

    const deliveries = rows.map((row, index) => {
      const pickup = clean(row.pickup_address);
      const dropoff = clean(row.dropoff_address);
      const fare = estimateFare({ pickup, dropoff, vehicle: "bike" satisfies VehicleType, speed: "standard" });
      return {
        customer_id: user.id,
        delivery_code: `FF-BULK-${Date.now().toString(36).toUpperCase()}-${index + 1}`,
        pickup_address: pickup,
        pickup_contact: `${clean(row.sender_name)} ${clean(row.sender_phone)}`,
        dropoff_address: dropoff,
        dropoff_contact: `${clean(row.recipient_name)} ${clean(row.recipient_phone)}`,
        parcel_type: clean(row.package_type) || "Parcel",
        vehicle_type: "bike",
        delivery_speed: "standard",
        payment_method: "wallet",
        status: "pending_payment",
        price_ngn: fare.total,
        distance_km: fare.distanceKm,
        eta_minutes: fare.etaMinutes,
        metadata: {
          source: "business_bulk_dispatch",
          sender_name: clean(row.sender_name),
          sender_phone: clean(row.sender_phone),
          recipient_name: clean(row.recipient_name),
          recipient_phone: clean(row.recipient_phone)
        }
      };
    });

    const invalidIndex = deliveries.findIndex((row) => !row.pickup_address || !row.dropoff_address || !row.pickup_contact.trim() || !row.dropoff_contact.trim());
    if (invalidIndex >= 0) {
      return NextResponse.json({ error: `Row ${invalidIndex + 1} is missing required dispatch details.` }, { status: 400 });
    }

    const total = deliveries.reduce((sum, row) => sum + Number(row.price_ngn || 0), 0);
    const { data: wallet } = await supabase.from("wallets").select("balance_ngn").eq("user_id", user.id).eq("wallet_type", "customer").maybeSingle();
    if (Number(wallet?.balance_ngn || 0) < total) {
      return NextResponse.json({ error: `Insufficient wallet balance for this bulk dispatch. Required: NGN ${Math.round(total).toLocaleString("en-NG")}.` }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("deliveries")
      .insert(deliveries)
      .select("id, delivery_code, pickup_address, dropoff_address, status, price_ngn, created_at, proof_url");
    if (error) throw error;

    const paymentResults = await Promise.allSettled(
      (data || []).map((delivery) =>
        supabase.rpc("pay_delivery_from_wallet", {
          target_delivery_id: delivery.id,
          next_metadata: { source: "business_bulk_dispatch" }
        })
      )
    );
    const failedPayment = paymentResults.find((result) => result.status === "rejected" || ("value" in result && result.value.error));
    if (failedPayment) {
      throw new Error("Bulk dispatches were created, but at least one wallet payment failed. Review the dispatch history before retrying.");
    }
    const paidDeliveries = (data || []).map((delivery) => ({ ...delivery, status: "searching" }));

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Bulk dispatch uploaded",
      body: `${paidDeliveries.length} dispatches were created and sent to rider matching.`,
      type: "bulk_dispatch_created",
      channel: "in_app",
      metadata: { count: paidDeliveries.length }
    });

    return NextResponse.json({ deliveries: paidDeliveries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create bulk dispatches." }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value || "").trim();
}
