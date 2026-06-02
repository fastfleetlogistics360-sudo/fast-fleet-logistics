import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { walletTypeForAccountKind, type WalletAccountKind } from "@/lib/wallet-ledger";

const accountKinds = new Set(["customer", "rider", "business"]);

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const accountKind = normalizeAccountKind(requestUrl.searchParams.get("accountKind"));
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to load transactions." }, { status: 401 });

    const db = createAdminClient() || supabase;
    const walletType = walletTypeForAccountKind(accountKind);
    const { data: wallet, error: walletError } = await db
      .from("wallets")
      .select("id, balance_ngn, locked_balance_ngn")
      .eq("user_id", user.id)
      .eq("wallet_type", walletType)
      .maybeSingle<{ id: string; balance_ngn?: number | null; locked_balance_ngn?: number | null }>();
    if (walletError) throw walletError;
    if (!wallet?.id) return NextResponse.json({ transactions: [], wallet: null });

    const { data, error } = await db
      .from("transactions")
      .select("id, delivery_id, transaction_type, amount_ngn, status, provider, provider_reference, metadata, created_at")
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .limit(80);
    if (error) throw error;

    const transactions = (data || []).filter((transaction) => transactionBelongsToAccount(transaction, accountKind));

    return NextResponse.json({
      wallet,
      transactions: transactions.map((transaction) => ({
        ...transaction,
        amount_ngn: Number(transaction.amount_ngn || 0)
      }))
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load wallet transactions." }, { status: 500 });
  }
}

function normalizeAccountKind(value: unknown): WalletAccountKind {
  const kind = String(value || "customer");
  return accountKinds.has(kind) ? (kind as WalletAccountKind) : "customer";
}

function transactionBelongsToAccount(transaction: { transaction_type?: string | null; metadata?: unknown }, accountKind: WalletAccountKind) {
  const metadata = transaction.metadata && typeof transaction.metadata === "object" && !Array.isArray(transaction.metadata) ? (transaction.metadata as Record<string, unknown>) : {};
  const metadataKind = String(metadata.account_kind || "");
  const withdrawalKind = String(metadata.withdrawal_account_kind || "");
  if (accountKind === "business") return metadataKind === "business" || withdrawalKind === "business";
  if (accountKind === "rider") return metadataKind === "rider" || withdrawalKind === "rider" || transaction.transaction_type === "rider_earning";
  return metadataKind !== "business" && withdrawalKind !== "business" && metadataKind !== "rider" && withdrawalKind !== "rider";
}
