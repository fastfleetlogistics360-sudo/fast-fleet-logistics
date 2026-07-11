import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordDeliveryIncome } from "@/lib/company-ledger";
import { convertMarketplaceDeliveryToBusinessOrder } from "@/lib/marketplace-order-repair";
import { insertNotificationWithPush } from "@/lib/notifications/push";
import { isPendingSquadStatus, isSuccessfulSquadStatus, verifySquadTransaction, type SquadTransaction } from "@/lib/payments/squad";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { accountMessengerHref } from "@/lib/tracking-links";
import { creditBusinessOrderWallet, recordCustomerMarketplacePayment } from "@/lib/wallet-ledger";

export async function GET(request: NextRequest) {
  try {
    const limited = await enforceRateLimit(request, { ...rateLimitPolicies.paymentVerify, name: "marketplace:verify" });
    if (limited) return limited;

    const reference =
      request.nextUrl.searchParams.get("reference") ||
      request.nextUrl.searchParams.get("transaction_ref") ||
      request.nextUrl.searchParams.get("TransactionRef") ||
      request.nextUrl.searchParams.get("trxref");
    if (!reference) return NextResponse.json({ error: "Missing payment reference." }, { status: 400 });

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to verify this marketplace payment." }, { status: 401 });

    const admin = createAdminClient();
    const db = (admin || supabase) as SupabaseClient;
    const squadTransaction = await verifySquadTransaction(reference);

    const squadStatus = String(squadTransaction.status || "Pending");
    if (!isSuccessfulSquadStatus(squadStatus)) {
      if (isPendingSquadStatus(squadStatus)) {
        return NextResponse.json({ reference, status: "pending", message: "Squad is still waiting for this marketplace payment to clear." }, { status: 202 });
      }
      return NextResponse.json({ error: `Payment status is ${squadStatus}.` }, { status: 400 });
    }

    const amountNgn = squadTransaction.amountNgn;
    const businessResult = await verifyBusinessOrderPayment(db, user.id, reference, amountNgn);
    if (businessResult) return NextResponse.json(businessResult);

    const deliveryResult = await verifyMarketplaceDeliveryPayment(db, user.id, reference, amountNgn, squadTransaction);
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
    throw new Error("Squad amount does not match this marketplace order total.");
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
      paymentMethod: "squad",
      reference,
      counterparty: userId,
      notes: "Squad linked marketplace order checkout was verified successfully."
    }),
    insertNotificationWithPush(db, {
      user_id: order.business_id,
      title: "New paid marketplace order",
      body: `${order.order_code || reference} is paid and waiting for your team to prepare.`,
      type: "business_order_received",
      metadata: { order_id: order.id, order_code: order.order_code || reference, business_profile_id: order.business_profile_id, url: "/business/dashboard#marketplace-orders", tag: `ff-business-${order.order_code || reference}` }
    }),
    insertNotificationWithPush(db, {
      user_id: userId,
      title: "Marketplace payment confirmed",
      body: `${order.order_code || reference} has been sent to the business.`,
      type: "order_update",
      metadata: { order_id: order.id, order_code: order.order_code || reference, status: "received", url: accountMessengerHref(order.order_code || reference), tag: `ff-${order.order_code || reference}` }
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
  squadTransaction: SquadTransaction
) {
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id, delivery_code, customer_id, pickup_address, dropoff_address, dropoff_contact, parcel_type, vehicle_type, payment_method, price_ngn, status, metadata, created_at")
    .eq("customer_id", userId)
    .eq("delivery_code", reference)
    .maybeSingle<{ id: string; delivery_code?: string | null; customer_id?: string | null; pickup_address?: string | null; dropoff_address?: string | null; dropoff_contact?: string | null; parcel_type?: string | null; vehicle_type?: string | null; payment_method?: string | null; price_ngn?: number | string | null; status?: string | null; metadata?: Record<string, unknown> | null; created_at?: string | null }>();
  if (error) throw error;
  if (!delivery?.id) return null;

  const metadata = delivery.metadata || {};
  if (String(metadata.provider_reference || "") !== reference) {
    throw new Error("Payment reference does not match this marketplace delivery.");
  }
  if (Math.round(amountNgn) !== Math.round(Number(delivery.price_ngn || 0))) {
    throw new Error("Squad amount does not match this marketplace delivery total.");
  }

  const convertedBusinessOrder = await convertMarketplaceDeliveryToBusinessOrder(db, delivery, { amountNgn, providerData: squadTransaction.raw });
  if (convertedBusinessOrder) return convertedBusinessOrder;

  await db
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

  await db.from("delivery_events").insert({
    delivery_id: delivery.id,
    actor_id: userId,
    status: "searching",
    title: "Payment received",
    body: "Squad marketplace payment confirmed. Fast Fleets 360 is notifying online drivers."
  });

  await recordDeliveryIncome({
    amountNgn,
    deliveryCode: delivery.delivery_code || reference,
    paymentMethod: String(squadTransaction.channel || delivery.payment_method || "squad"),
    reference,
    counterparty: userId,
    notes: "Squad marketplace checkout was verified successfully."
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
