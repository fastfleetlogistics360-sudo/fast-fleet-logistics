import { createAdminClient } from "@/lib/supabase/admin";

type DeliveryIncomeInput = {
  amountNgn: number;
  deliveryCode: string;
  paymentMethod: string;
  reference: string;
  counterparty?: string | null;
  notes?: string | null;
};

export async function recordDeliveryIncome({
  amountNgn,
  deliveryCode,
  paymentMethod,
  reference,
  counterparty,
  notes
}: DeliveryIncomeInput) {
  const supabase = createAdminClient();
  if (!supabase || !reference || !Number.isFinite(amountNgn) || amountNgn <= 0) return;

  const { data: existing } = await supabase
    .from("company_transaction_logs")
    .select("id")
    .eq("reference", reference)
    .limit(1);

  if (existing?.length) return;

  await supabase.from("company_transaction_logs").insert({
    entry_date: new Date().toISOString().slice(0, 10),
    category: "delivery_income",
    direction: "income",
    amount_ngn: Math.round(amountNgn),
    title: `Delivery income ${deliveryCode}`,
    counterparty: counterparty || null,
    reference,
    payment_method: paymentMethod,
    status: "cleared",
    notes: notes || "Recorded automatically from customer checkout."
  });
}
