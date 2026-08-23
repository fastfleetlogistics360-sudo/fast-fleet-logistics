import { NextResponse } from "next/server";
import { createMarketplaceReceiptPdf } from "@/lib/marketplace-receipt";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type ReceiptItem = { name?: string; productName?: string; quantity?: number; price?: number; subtotal?: number };

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const deliveryId = String(params.get("deliveryId") || "").trim();
  const orderId = String(params.get("orderId") || "").trim();
  if (!deliveryId && !orderId) return NextResponse.json({ error: "Choose a completed marketplace order." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to download your receipt." }, { status: 401 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Receipt downloads are not configured." }, { status: 503 });

  try {
    const receipt = orderId
      ? await receiptForBusinessOrder(db, orderId, user.id)
      : await receiptForDirectDelivery(db, deliveryId, user.id);
    if (!receipt) return NextResponse.json({ error: "This receipt is unavailable until the marketplace delivery is completed." }, { status: 404 });
    const pdf = await createMarketplaceReceiptPdf(receipt);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fastfleets-${safeFilePart(receipt.receiptCode)}-receipt.pdf"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch {
    return NextResponse.json({ error: "Could not create your receipt." }, { status: 500 });
  }
}

async function receiptForBusinessOrder(db: NonNullable<ReturnType<typeof createAdminClient>>, orderId: string, userId: string) {
  const { data: order, error } = await db
    .from("orders")
    .select("id, order_code, customer_id, marketplace_kind, items, pickup_address, dropoff_address, status, amount, delivery_fee_ngn, platform_fee_ngn, created_at, delivered_at")
    .eq("id", orderId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!order || order.status !== "delivered") return null;
  return buildReceipt({
    receiptCode: String(order.order_code || order.id), createdAt: order.created_at, deliveredAt: order.delivered_at,
    marketplaceKind: order.marketplace_kind, pickupAddress: order.pickup_address, dropoffAddress: order.dropoff_address,
    items: order.items, totalPaidNgn: Number(order.amount || 0), deliveryFeeNgn: Number(order.delivery_fee_ngn || 0), platformFeeNgn: Number(order.platform_fee_ngn || 0)
  });
}

async function receiptForDirectDelivery(db: NonNullable<ReturnType<typeof createAdminClient>>, deliveryId: string, userId: string) {
  const { data: delivery, error } = await db
    .from("deliveries")
    .select("id, delivery_code, customer_id, pickup_address, dropoff_address, status, price_ngn, delivery_fee_ngn, platform_fee_ngn, metadata, created_at, delivered_at")
    .eq("id", deliveryId)
    .eq("customer_id", userId)
    .maybeSingle();
  if (error) throw error;
  const metadata = record(delivery?.metadata);
  if (!delivery || delivery.status !== "delivered" || !String(metadata.source || "").includes("marketplace")) return null;
  return buildReceipt({
    receiptCode: String(delivery.delivery_code || delivery.id), createdAt: delivery.created_at, deliveredAt: delivery.delivered_at,
    marketplaceKind: String(metadata.kind || "restaurant"), pickupAddress: delivery.pickup_address, dropoffAddress: delivery.dropoff_address,
    items: metadata.items, totalPaidNgn: Number(delivery.price_ngn || 0),
    deliveryFeeNgn: Number(metadata.payable_delivery_fee_ngn ?? metadata.delivery_fee_ngn ?? delivery.delivery_fee_ngn ?? 0),
    platformFeeNgn: Number(metadata.platform_fee_ngn ?? delivery.platform_fee_ngn ?? 0)
  });
}

function buildReceipt(input: { receiptCode: string; createdAt?: string | null; deliveredAt?: string | null; marketplaceKind?: string | null; pickupAddress: string; dropoffAddress: string; items: unknown; totalPaidNgn: number; deliveryFeeNgn: number; platformFeeNgn: number }) {
  const items = Array.isArray(input.items) ? input.items.map((item) => {
    const value = record(item) as ReceiptItem;
    const quantity = Math.max(1, Number(value.quantity || 1));
    return { name: String(value.name || value.productName || "Marketplace item"), quantity, amountNgn: Number(value.subtotal || Number(value.price || 0) * quantity) || null };
  }) : [];
  const goodsAmountNgn = items.reduce((sum, item) => sum + Number(item.amountNgn || 0), 0);
  return { ...input, createdAt: input.createdAt || null, deliveredAt: input.deliveredAt || null, items, goodsAmountNgn: goodsAmountNgn || Math.max(0, input.totalPaidNgn - input.deliveryFeeNgn - input.platformFeeNgn) };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeFilePart(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "-").slice(0, 80) || "marketplace-order";
}
