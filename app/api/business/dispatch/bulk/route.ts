import { NextResponse } from "next/server";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { createDeliveryQuote } from "@/lib/delivery-quotes";
import { loadFareConfig } from "@/lib/fare-settings";
import { extractNigerianState } from "@/lib/location/state-matching";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
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
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in before creating dispatches." }, { status: 401 });
    const limited = await enforceRateLimit(request, rateLimitPolicies.businessBulkDispatch);
    if (limited) return limited;

    const body = (await request.json()) as { rows?: BulkRow[] };
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 100) : [];
    if (!rows.length) return NextResponse.json({ error: "Upload at least one valid dispatch row." }, { status: 400 });

    const { data: businessProfile } = await supabase
      .from("business_profiles")
      .select("business_name, registration_status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (businessProfile?.registration_status !== "active") {
      return NextResponse.json({ error: "Business KYC must be approved before creating dispatches." }, { status: 403 });
    }

    const normalizedRows = rows.map((row) => ({
      pickup: clean(row.pickup_address),
      dropoff: clean(row.dropoff_address),
      senderName: clean(row.sender_name),
      senderPhone: clean(row.sender_phone),
      recipientName: clean(row.recipient_name),
      recipientPhone: clean(row.recipient_phone),
      packageType: clean(row.package_type) || "Parcel"
    }));

    const invalidIndex = normalizedRows.findIndex((row) => !row.pickup || !row.dropoff || !row.senderName || !row.senderPhone || !row.recipientName || !row.recipientPhone);
    if (invalidIndex >= 0) {
      return NextResponse.json({ error: `Row ${invalidIndex + 1} is missing required dispatch details.` }, { status: 400 });
    }

    const fareConfig = await loadFareConfig();
    const deliveries = await Promise.all(normalizedRows.map(async (row, index) => {
      const quote = await createDeliveryQuote({
        pickup: { address: row.pickup },
        dropoff: { address: row.dropoff },
        pickupState: extractNigerianState(row.pickup),
        dropoffState: extractNigerianState(row.dropoff),
        vehicle: "bike" satisfies VehicleType,
        speed: "standard",
        parcelType: row.packageType,
        fareConfig
      });
      const fare = quote.fare;
      return {
        customer_id: user.id,
        delivery_code: `FF-BULK-${Date.now().toString(36).toUpperCase()}-${index + 1}`,
        pickup_address: row.pickup,
        pickup_contact: `${row.senderName} ${row.senderPhone}`,
        dropoff_address: row.dropoff,
        dropoff_contact: `${row.recipientName} ${row.recipientPhone}`,
        parcel_type: row.packageType,
        vehicle_type: "bike",
        delivery_speed: "standard",
        payment_method: "wallet",
        status: "pending_payment",
        price_ngn: fare.total,
        delivery_fee_ngn: fare.deliveryFee,
        platform_fee_ngn: fare.platformFee,
        distance_km: fare.distanceKm,
        eta_minutes: fare.etaMinutes,
        route_source: quote.routeSource,
        route_type: quote.routeType,
        route_duration_seconds: quote.durationSeconds,
        vehicle_subtype: quote.vehicleSubtype,
        metadata: {
          source: "business_bulk_dispatch",
          pickup_state: quote.pickupState || null,
          dropoff_state: quote.dropoffState || null,
          route_source: quote.routeSource,
          route_type: quote.routeType,
          route_duration_seconds: quote.durationSeconds,
          bicycle_eligible: quote.bicycleEligible,
          vehicle_subtype: quote.vehicleSubtype,
          delivery_fee_ngn: fare.deliveryFee,
          platform_fee_ngn: fare.platformFee,
          sender_name: row.senderName,
          sender_phone: row.senderPhone,
          recipient_name: row.recipientName,
          recipient_phone: row.recipientPhone
        }
      };
    }));

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
    await Promise.allSettled(
      paidDeliveries.map((delivery) =>
        recordDeliveryIncome({
          amountNgn: Number(delivery.price_ngn || 0),
          deliveryCode: delivery.delivery_code,
          paymentMethod: "wallet",
          reference: `${delivery.delivery_code}-wallet-checkout`,
          counterparty: businessProfile?.business_name || user.email || user.id,
          notes: "Business bulk wallet dispatch payment was recorded automatically."
        })
      )
    );

    return NextResponse.json({ deliveries: paidDeliveries });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create bulk dispatches." }, { status: 500 });
  }
}

function clean(value: unknown) {
  return String(value || "").trim().slice(0, 500);
}
