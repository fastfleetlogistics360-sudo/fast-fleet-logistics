import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MIN_WITHDRAWAL_NGN } from "@/lib/wallet-ledger";

export async function POST(request: Request) {
  try {
    const { amount } = (await request.json()) as { amount?: number };
    const amountNgn = Number(amount);
    if (!Number.isFinite(amountNgn) || amountNgn < MIN_WITHDRAWAL_NGN) {
      return NextResponse.json({ error: `Minimum withdrawal is NGN ${MIN_WITHDRAWAL_NGN.toLocaleString("en-NG")}.` }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });

    const { data: rider, error: riderError } = await supabase
      .from("rider_profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (riderError) throw riderError;
    if (!rider?.id) return NextResponse.json({ error: "Rider profile not found." }, { status: 404 });

    const { data: id, error } = await supabase.rpc("create_withdrawal_request", {
      target_rider_profile_id: rider.id,
      next_amount_ngn: amountNgn
    });
    if (error) throw error;

    const { data: withdrawal } = await supabase
      .from("withdrawal_requests")
      .select("id, amount_ngn, bank_name, account_number, status, created_at")
      .eq("id", id)
      .single();

    await supabase.from("notifications").insert({
      user_id: user.id,
      title: "Withdrawal requested",
      body: `Your NGN ${Math.round(amountNgn).toLocaleString("en-NG")} payout is pending admin review.`,
      type: "withdrawal_requested",
      channel: "in_app",
      metadata: { withdrawal_request_id: String(id), amount_ngn: amountNgn }
    });

    return NextResponse.json({ withdrawal });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not request withdrawal." }, { status: 500 });
  }
}
