import type { SupabaseClient } from "@supabase/supabase-js";

export const MIN_WITHDRAWAL_NGN = 2000;
export const MAX_WITHDRAWAL_NGN = 200000;
export const PAYOUT_SLA_HOURS = 10;

export type WalletAccountKind = "customer" | "rider" | "business";
export type WalletTypeName = "customer" | "rider";

type WalletRow = {
  id: string;
  user_id: string;
  wallet_type: WalletTypeName;
  balance_ngn?: number | string | null;
  locked_balance_ngn?: number | string | null;
};

type JsonRecord = Record<string, unknown>;

const riderCommissionRateByAccountType: Record<string, number> = {
  independent: 10,
  fastfleets360: 5
};

function nowIso() {
  return new Date().toISOString();
}

function money(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function metadataRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

export function walletTypeForAccountKind(accountKind: WalletAccountKind): WalletTypeName {
  return accountKind === "rider" ? "rider" : "customer";
}

export function formatWithdrawalLike(row: {
  id: string;
  amount_ngn: number;
  bank_name?: string | null;
  account_number?: string | null;
  account_name?: string | null;
  status?: string | null;
  rejection_reason?: string | null;
  created_at?: string | null;
}) {
  return {
    id: row.id,
    amount_ngn: row.amount_ngn,
    bank_name: row.bank_name || "Bank pending",
    account_number: row.account_number || "Account pending",
    account_name: row.account_name || "Name pending",
    status: row.status || "pending",
    rejection_reason: row.rejection_reason || null,
    created_at: row.created_at || nowIso()
  };
}

export async function ensureWallet(db: SupabaseClient, userId: string, walletType: WalletTypeName) {
  const { data, error } = await db
    .from("wallets")
    .upsert({ user_id: userId, wallet_type: walletType }, { onConflict: "user_id,wallet_type" })
    .select("id, user_id, wallet_type, balance_ngn, locked_balance_ngn")
    .single<WalletRow>();
  if (error) throw error;
  return data;
}

export function businessGoodsAmount(items: unknown, fallbackTotal = 0) {
  if (!Array.isArray(items)) return Math.max(0, Math.round(fallbackTotal));
  const total = items.reduce((sum, item) => {
    const record = metadataRecord(item);
    const subtotal = money(record.subtotal);
    if (subtotal > 0) return sum + subtotal;
    return sum + money(record.price) * Math.max(1, money(record.quantity) || 1);
  }, 0);
  return Math.max(0, Math.round(total || fallbackTotal));
}

export async function marketplaceDeliveryFee(db: SupabaseClient, order: {
  amount?: number | string | null;
  delivery_fee_ngn?: number | string | null;
  items?: unknown;
  dropoff_address?: string | null;
  marketplace_kind?: string | null;
}) {
  const storedFee = money(order.delivery_fee_ngn);
  if (storedFee > 0) return Math.max(0, Math.round(storedFee));
  const total = money(order.amount);
  const goods = businessGoodsAmount(order.items, total);
  return Math.max(0, Math.round(total - goods));
}

export async function creditBusinessOrderWallet(db: SupabaseClient, orderId: string) {
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, order_code, customer_id, business_id, business_profile_id, marketplace_kind, items, amount, payment_status")
    .eq("id", orderId)
    .maybeSingle<{
      id: string;
      order_code?: string | null;
      customer_id?: string | null;
      business_id?: string | null;
      business_profile_id?: string | null;
      marketplace_kind?: string | null;
      items?: unknown;
      amount?: number | string | null;
      payment_status?: string | null;
    }>();
  if (orderError) throw orderError;
  if (!order?.business_id) return { credited: false, amount: 0 };

  const amount = businessGoodsAmount(order.items, money(order.amount));
  if (amount <= 0) return { credited: false, amount: 0 };

  const providerReference = `${order.order_code || order.id}-business-goods-credit`;
  const { data: existing } = await db
    .from("transactions")
    .select("id")
    .eq("provider_reference", providerReference)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return { credited: false, amount };

  const wallet = await ensureWallet(db, order.business_id, "customer");
  const { error: transactionError } = await db.from("transactions").insert({
    wallet_id: wallet.id,
    transaction_type: "wallet_funding",
    amount_ngn: amount,
    status: "successful",
    provider: "business_order_checkout",
    provider_reference: providerReference,
    metadata: {
      account_kind: "business",
      title: "Business order income",
      order_id: order.id,
      order_code: order.order_code,
      business_profile_id: order.business_profile_id,
      customer_id: order.customer_id,
      goods_amount_ngn: amount
    }
  });
  if (transactionError) {
    const duplicate = String((transactionError as { code?: string; message?: string }).code || "") === "23505" || /duplicate|unique/i.test(String(transactionError.message || ""));
    if (duplicate) return { credited: false, amount };
    throw transactionError;
  }

  const nextBalance = money(wallet.balance_ngn) + amount;
  await Promise.allSettled([
    db.from("wallets").update({ balance_ngn: nextBalance, updated_at: nowIso() }).eq("id", wallet.id),
    db.from("orders").update({ payment_status: "paid", updated_at: nowIso() }).eq("id", order.id),
    db.from("notifications").insert({
      user_id: order.business_id,
      title: "Business wallet credited",
      body: `${order.order_code || "Order"} goods payment of NGN ${amount.toLocaleString("en-NG")} has been credited to your business wallet.`,
      type: "business_wallet_credit",
      channel: "in_app",
      metadata: { order_id: order.id, order_code: order.order_code, amount_ngn: amount }
    })
  ]);

  return { credited: true, amount };
}

export async function recordCustomerMarketplacePayment(db: SupabaseClient, input: {
  userId: string;
  amountNgn: number;
  providerReference: string;
  deliveryId?: string | null;
  orderId?: string | null;
  orderCode?: string | null;
  marketplaceKind?: string | null;
  title?: string;
  metadata?: JsonRecord;
}) {
  const amount = Math.max(0, Math.round(money(input.amountNgn)));
  if (!input.userId || amount <= 0 || !input.providerReference) return { recorded: false };

  const providerReference = `${input.providerReference}-customer-marketplace-payment`;
  const { data: existing } = await db
    .from("transactions")
    .select("id")
    .eq("provider_reference", providerReference)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return { recorded: false };

  const wallet = await ensureWallet(db, input.userId, "customer");
  const { error } = await db.from("transactions").insert({
    wallet_id: wallet.id,
    delivery_id: input.deliveryId || null,
    transaction_type: "delivery_payment",
    amount_ngn: amount * -1,
    status: "successful",
    provider: "squad_marketplace",
    provider_reference: providerReference,
    metadata: {
      title: input.title || "Marketplace order payment",
      source: "fastfleet_marketplace",
      order_id: input.orderId || null,
      order_code: input.orderCode || input.providerReference,
      delivery_id: input.deliveryId || null,
      marketplace_kind: input.marketplaceKind || null,
      ...metadataRecord(input.metadata)
    }
  });
  if (error) throw error;
  return { recorded: true };
}

export async function creditRiderDeliveryWallet(db: SupabaseClient, deliveryId: string) {
  const { data: delivery, error: deliveryError } = await db
    .from("deliveries")
    .select("id, delivery_code, rider_id, price_ngn, status, metadata")
    .eq("id", deliveryId)
    .maybeSingle<{
      id: string;
      delivery_code?: string | null;
      rider_id?: string | null;
      price_ngn?: number | string | null;
      status?: string | null;
      metadata?: unknown;
    }>();
  if (deliveryError) throw deliveryError;
  if (!delivery?.rider_id || delivery.status !== "delivered") return { credited: false, amount: 0 };

  const metadata = metadataRecord(delivery.metadata);
  const providerReference = `${delivery.delivery_code || delivery.id}-rider-earning`;
  const { data: existing } = await db
    .from("transactions")
    .select("id")
    .eq("provider_reference", providerReference)
    .maybeSingle<{ id: string }>();
  if (existing?.id) return { credited: false, amount: money(metadata.delivery_fee_ngn || delivery.price_ngn) };

  let amount = money(metadata.delivery_fee_ngn);
  if (!amount && typeof metadata.business_order_id === "string") {
    const { data: order } = await db
      .from("orders")
      .select("items, amount, delivery_fee_ngn, dropoff_address, marketplace_kind")
      .eq("id", metadata.business_order_id)
      .maybeSingle<{ items?: unknown; amount?: number | string | null; delivery_fee_ngn?: number | string | null; dropoff_address?: string | null; marketplace_kind?: string | null }>();
    if (order) amount = await marketplaceDeliveryFee(db, order);
  }
  if (!amount) amount = money(delivery.price_ngn);
  amount = Math.max(0, Math.round(amount));
  if (amount <= 0) return { credited: false, amount: 0 };

  const { data: rider, error: riderError } = await db
    .from("rider_profiles")
    .select("id, user_id")
    .eq("id", delivery.rider_id)
    .maybeSingle<{ id: string; user_id?: string | null }>();
  if (riderError) throw riderError;
  if (!rider?.user_id) return { credited: false, amount: 0 };

  const wallet = await ensureWallet(db, rider.user_id, "rider");
  const { error: transactionError } = await db.from("transactions").insert({
    wallet_id: wallet.id,
    delivery_id: delivery.id,
    transaction_type: "rider_earning",
    amount_ngn: amount,
    status: "successful",
    provider: "delivery_completion",
    provider_reference: providerReference,
    metadata: {
      account_kind: "rider",
      title: "Delivery fee earned",
      rider_profile_id: rider.id,
      delivery_id: delivery.id,
      delivery_code: delivery.delivery_code,
      delivery_fee_ngn: amount
    }
  });
  if (transactionError) {
    const duplicate = String((transactionError as { code?: string; message?: string }).code || "") === "23505" || /duplicate|unique/i.test(String(transactionError.message || ""));
    if (duplicate) return { credited: false, amount };
    throw transactionError;
  }

  const nextBalance = money(wallet.balance_ngn) + amount;
  await Promise.allSettled([
    db.from("wallets").update({ balance_ngn: nextBalance, updated_at: nowIso() }).eq("id", wallet.id),
    db.from("notifications").insert({
      user_id: rider.user_id,
      title: "Delivery earning credited",
      body: `${delivery.delivery_code || "Delivery"} fee of NGN ${amount.toLocaleString("en-NG")} has been added to your rider wallet.`,
      type: "rider_earning",
      channel: "in_app",
      metadata: { delivery_id: delivery.id, delivery_code: delivery.delivery_code, amount_ngn: amount }
    })
  ]);

  return { credited: true, amount };
}

export function riderCommissionRate(accountType: string | null | undefined) {
  return riderCommissionRateByAccountType[accountType || ""] ?? riderCommissionRateByAccountType.independent;
}

export function withdrawalStatusFromTransaction(status: string | null | undefined, metadata: unknown) {
  const reviewStatus = String(metadataRecord(metadata).withdrawal_status || "");
  if (reviewStatus === "approved" || reviewStatus === "rejected" || reviewStatus === "paid") return reviewStatus;
  if (status === "successful") return "paid";
  if (status === "failed" || status === "reversed") return "rejected";
  return "pending";
}

export function withdrawalMetadata(value: unknown) {
  const metadata = metadataRecord(value);
  return {
    withdrawal_request_id: String(metadata.withdrawal_request_id || ""),
    withdrawal_account_kind: String(metadata.withdrawal_account_kind || ""),
    bank_name: typeof metadata.bank_name === "string" ? metadata.bank_name : null,
    account_number: typeof metadata.account_number === "string" ? metadata.account_number : null,
    account_name: typeof metadata.account_name === "string" ? metadata.account_name : null,
    rejection_reason: typeof metadata.rejection_reason === "string" ? metadata.rejection_reason : null
  };
}
