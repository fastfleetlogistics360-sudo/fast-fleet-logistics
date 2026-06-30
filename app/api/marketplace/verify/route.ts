import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { creditBusinessOrderWallet, recordCustomerMarketplacePayment } from "@/lib/wallet-ledger";

const PAYSTACK_VERIFY_URL = "https://api.paystack.co/transaction/verify";
const pendingPaystackStatuses = new Set(["ongoing", "pending", "processing", "queued"]);

export async function GET(request: NextRequest) {
  try {
    const reference = request.nextUrl.searchParams.get("reference") || request.nextUrl.searchParams.get("trxref");
    if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return NextResponse.json({ error: "Missing PAYSTACK_SECRET_KEY. Add it before marketplace checkout." }, { status: 500 });

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to verify this marketplace payment." }, { status: 401 });

    const admin = createAdminClient();
    const db = (admin || supabase) as SupabaseClient;
    const paystackResponse = await fetch(`${PAYSTACK_VERIFY_URL}/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` }
    });
    const paystackData = await paystackResponse.json();

    if (!paystackResponse.ok || !paystackData.status) {
      return NextResponse.json({ error: paystackData.message || "Paystack verification failed." }, { status: 502 });
    }

    const paystackStatus = String(paystackData.data.status || "pending");
    if (paystackStatus !== "success") {
      if (pendingPaystackStatuses.has(paystackStatus)) {
        return NextResponse.json({ reference, status: "pending", message: "Paystack is still waiting for this marketplace payment to clear." }, { status: 202 });
      }
      return NextResponse.json({ error: `Payment status is ${paystackStatus}.` }, { status: 400 });
    }

    const amountNgn = Number(paystackData.data.amount) / 100;
    const businessResult = await verifyBusinessOrderPayment(db, user.id, reference, amountNgn);
    if (businessResult) return NextResponse.json(businessResult);

    const deliveryResult = await verifyMarketplaceDeliveryPayment(db, user.id, reference, amountNgn, paystackData.data);
    if (deliveryResult) return NextResponse.json(deliveryResult);

    return NextResponse.json({ error: "Marketplace order was not found for this payment." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Marketplace payment verification failed." }, { status: 500 });
  }
}

async function verifyBusinessOrderPayment(db: SupabaseClient, userId: string, reference: string, amountNgn: number) {
  const { data: order, error } = await db
    .from("orders")
    .select("id, order_code, customer_id, business_id, business_profile_id, marketplace_kind, amount, payment_status, status")
    .eq("customer_id", userId)
    .eq("order_code", reference)
    .maybeSingle<{ id: string; order_code?: string | null; customer_id?: string | null; business_id?: string | null; business_profile_id?: string | null; marketplace_kind?: string | null; amount?: number | string | null; payment_status?: string | null; status?: string | null }>();
  if (error) throw error;
  if (!order?.id || !order.business_id) return null;

  if (Math.round(amountNgn) !== Math.round(Number(order.amount || 0))) {
    throw new Error("Paystack amount does not match this marketplace order total.");
  }

  const credit = await creditBusinessOrderWallet(db, order.id);
  await Promise.allSettled([
    db
      .from("orders")
      .update({
        status: order.status === "pending" ? "received" : order.status || "received",
        payment_status: "paid",
        updated_at: new Date().toISOString()
      })
      .eq("id", order.id),
    recordCustomerMarketplacePayment(db, {
      userId,
      amountNgn,
      providerReference: reference,
      orderId: order.id,
      orderCode: order.order_code || reference,
      marketplaceKind: order.marketplace_kind,
      metadata: {
        business_id: order.business_id,
        business_profile_id: order.business_profile_id
      }
    }),
    recordDeliveryIncome({
      amountNgn,
      deliveryCode: order.order_code || reference,
      paymentMethod: "paystack",
      reference,
      counterparty: userId,
      notes: "Paystack linked marketplace order checkout was verified successfully."
    }),
    db.from("notifications").insert({
      user_id: order.business_id,
      title: "New paid marketplace order",
      body: `${order.order_code || reference} is paid and waiting for your team to prepare.`,
      type: "business_order_received",
      channel: "in_app",
      metadata: { order_id: order.id, order_code: order.order_code || reference, business_profile_id: order.business_profile_id }
    }),
    db.from("notifications").insert({
      user_id: userId,
      title: "Marketplace payment confirmed",
      body: `${order.order_code || reference} has been sent to the business.`,
      type: "order_update",
      channel: "in_app",
      metadata: { order_id: order.id, order_code: order.order_code || reference, status: "received" }
    })
  ]);
  return {
    kind: "business_order",
    orderId: order.id,
    orderCode: order.order_code || reference,
    amount: amountNgn,
    credited: credit.credited,
    businessAmount: credit.amount,
    status: "successful"
  };
}

async function verifyMarketplaceDeliveryPayment(
  db: SupabaseClient,
  userId: string,
  reference: string,
  amountNgn: number,
  paystackData: Record<string, unknown>
) {
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id, delivery_code, customer_id, payment_method, price_ngn, status, metadata")
    .eq("customer_id", userId)
    .eq("delivery_code", reference)
    .maybeSingle<{ id: string; delivery_code?: string | null; customer_id?: string | null; payment_method?: string | null; price_ngn?: number | string | null; status?: string | null; metadata?: Record<string, unknown> | null }>();
  if (error) throw error;
  if (!delivery?.id) return null;

  const metadata = delivery.metadata || {};
  if (String(metadata.paystack_reference || "") !== reference) {
    throw new Error("Payment reference does not match this marketplace delivery.");
  }
  if (Math.round(amountNgn) !== Math.round(Number(delivery.price_ngn || 0))) {
    throw new Error("Paystack amount does not match this marketplace delivery total.");
  }

  await db
    .from("deliveries")
    .update({
      status: "searching",
      metadata: {
        ...metadata,
        paystack_paid_at: typeof paystackData.paid_at === "string" ? paystackData.paid_at : new Date().toISOString(),
        paystack_id: paystackData.id,
        paystack_status: paystackData.status,
        paystack_channel: paystackData.channel,
        paystack_gateway_response: paystackData.gateway_response
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", delivery.id);

  await recordDeliveryIncome({
    amountNgn,
    deliveryCode: delivery.delivery_code || reference,
    paymentMethod: String(paystackData.channel || delivery.payment_method || "paystack"),
    reference,
    counterparty: userId,
    notes: "Paystack marketplace checkout was verified successfully."
  });

  await recordCustomerMarketplacePayment(db, {
    userId,
    amountNgn,
    providerReference: reference,
    deliveryId: delivery.id,
    orderCode: delivery.delivery_code || reference,
    marketplaceKind: typeof metadata.kind === "string" ? metadata.kind : null
  });

  return {
    kind: "marketplace_delivery",
    deliveryId: delivery.id,
    deliveryCode: delivery.delivery_code || reference,
    amount: amountNgn,
    status: "successful"
  };
}
