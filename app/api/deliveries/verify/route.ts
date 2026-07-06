import { NextRequest, NextResponse } from "next/server";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { isPendingSquadStatus, isSuccessfulSquadStatus, verifySquadTransaction } from "@/lib/payments/squad";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const reference =
      request.nextUrl.searchParams.get("reference") ||
      request.nextUrl.searchParams.get("transaction_ref") ||
      request.nextUrl.searchParams.get("TransactionRef") ||
      request.nextUrl.searchParams.get("trxref");
    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase() || "";
    const deliveryId = request.nextUrl.searchParams.get("deliveryId") || "";

    if (!reference || (!code && !deliveryId)) {
      return NextResponse.json({ error: "Missing payment reference or delivery code." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to verify this delivery payment." }, { status: 401 });
    const admin = createAdminClient();
    const db = admin || supabase;

    const squadTransaction = await verifySquadTransaction(reference);

    const query = db
      .from("deliveries")
      .select("id, delivery_code, customer_id, payment_method, price_ngn, status, metadata")
      .eq("customer_id", user.id);
    const { data: delivery, error: deliveryError } = deliveryId
      ? await query.eq("id", deliveryId).maybeSingle()
      : await query.eq("delivery_code", code).maybeSingle();

    if (deliveryError) throw deliveryError;
    if (!delivery) return NextResponse.json({ error: "Delivery not found for this payment." }, { status: 404 });

    const metadata = (delivery.metadata || {}) as Record<string, unknown>;
    if (String(metadata.provider_reference || "") !== reference) {
      return NextResponse.json({ error: "Payment reference does not match this delivery." }, { status: 400 });
    }

    if (!isSuccessfulSquadStatus(squadTransaction.status)) {
      const squadStatus = String(squadTransaction.status || "Pending");
      await db.from("deliveries").update({
        metadata: {
          ...metadata,
          provider_status: squadStatus,
          squad_gateway_reference: squadTransaction.gatewayReference,
          squad_raw_status: squadTransaction.raw
        }
      }).eq("id", delivery.id);
      if (isPendingSquadStatus(squadStatus)) {
        return NextResponse.json(
          {
            reference,
            deliveryId: delivery.id,
            deliveryCode: delivery.delivery_code,
            status: "pending",
            message: "Squad is still waiting for this payment to clear."
          },
          { status: 202 }
        );
      }
      return NextResponse.json({ error: `Payment status is ${squadStatus}.` }, { status: 400 });
    }

    const amountNgn = squadTransaction.amountNgn;
    if (Math.round(amountNgn) !== Math.round(Number(delivery.price_ngn || 0))) {
      return NextResponse.json({ error: "Squad amount does not match this delivery total." }, { status: 400 });
    }

    if (delivery.status !== "searching") {
      const { error: updateError } = await db
        .from("deliveries")
        .update({
          status: "searching",
          metadata: {
            ...metadata,
            provider_paid_at: squadTransaction.paidAt,
            provider_status: squadTransaction.status,
            provider_channel: squadTransaction.channel,
            squad_gateway_reference: squadTransaction.gatewayReference,
            squad_raw: squadTransaction.raw
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", delivery.id);
      if (updateError) throw updateError;

      await db.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "searching",
        title: "Payment received",
        body: "Squad payment confirmed. Fast Fleets 360 is notifying online drivers."
      });
    }

    await recordDeliveryIncome({
      amountNgn,
      deliveryCode: delivery.delivery_code,
      paymentMethod: squadTransaction.channel || delivery.payment_method || "squad",
      reference,
      counterparty: user.email || user.id,
      notes: "Squad delivery checkout was verified successfully."
    });

    return NextResponse.json({
      deliveryId: delivery.id,
      deliveryCode: delivery.delivery_code,
      amount: amountNgn,
      status: "successful"
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delivery payment verification failed." }, { status: 500 });
  }
}
