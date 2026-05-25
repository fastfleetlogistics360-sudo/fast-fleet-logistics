import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify";

export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("trxref");
    const code = request.nextUrl.searchParams.get("code")?.trim().toUpperCase() || "";
    const deliveryId = request.nextUrl.searchParams.get("deliveryId") || "";

    if (!reference || (!code && !deliveryId)) {
      return NextResponse.json({ error: "Missing payment reference or delivery code." }, { status: 400 });
    }

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add your Paystack secret key to .env.local." }, { status: 500 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to verify this delivery payment." }, { status: 401 });

    const paystackResponse = await fetch(`${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`
      }
    });
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return NextResponse.json({ error: paystackData.message || "Paystack verification failed." }, { status: 502 });
    }

    const query = supabase
      .from("deliveries")
      .select("id, delivery_code, customer_id, payment_method, price_ngn, status, metadata")
      .eq("customer_id", user.id);
    const { data: delivery, error: deliveryError } = deliveryId
      ? await query.eq("id", deliveryId).maybeSingle()
      : await query.eq("delivery_code", code).maybeSingle();

    if (deliveryError) throw deliveryError;
    if (!delivery) return NextResponse.json({ error: "Delivery not found for this payment." }, { status: 404 });

    const metadata = (delivery.metadata || {}) as Record<string, unknown>;
    if (String(metadata.paystack_reference || "") !== reference) {
      return NextResponse.json({ error: "Payment reference does not match this delivery." }, { status: 400 });
    }

    if (paystackData.data.status !== "success") {
      await supabase.from("deliveries").update({
        metadata: {
          ...metadata,
          paystack_status: paystackData.data.status,
          paystack_gateway_response: paystackData.data.gateway_response
        }
      }).eq("id", delivery.id);
      return NextResponse.json({ error: `Payment status is ${paystackData.data.status}.` }, { status: 400 });
    }

    const amountNgn = Number(paystackData.data.amount) / 100;
    if (Math.round(amountNgn) !== Math.round(Number(delivery.price_ngn || 0))) {
      return NextResponse.json({ error: "Paystack amount does not match this delivery total." }, { status: 400 });
    }

    if (delivery.status !== "searching") {
      const paidAt = paystackData.data.paid_at || new Date().toISOString();
      const { error: updateError } = await supabase
        .from("deliveries")
        .update({
          status: "searching",
          metadata: {
            ...metadata,
            paystack_paid_at: paidAt,
            paystack_id: paystackData.data.id,
            paystack_status: paystackData.data.status,
            paystack_channel: paystackData.data.channel,
            paystack_gateway_response: paystackData.data.gateway_response
          },
          updated_at: new Date().toISOString()
        })
        .eq("id", delivery.id);
      if (updateError) throw updateError;

      await supabase.from("delivery_events").insert({
        delivery_id: delivery.id,
        actor_id: user.id,
        status: "searching",
        title: "Payment received",
        body: "Paystack payment confirmed. FastFleet is notifying online drivers."
      });
    }

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
