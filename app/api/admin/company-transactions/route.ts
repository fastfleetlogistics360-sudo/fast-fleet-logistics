import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { canUseDemoFallback, missingServiceResponse } from "@/lib/runtime";
import type { Database } from "@/lib/supabase/types";

type CompanyTransactionInsert = Database["public"]["Tables"]["company_transaction_logs"]["Insert"];
type CompanyTransactionUpdate = Database["public"]["Tables"]["company_transaction_logs"]["Update"];

const categories = new Set([
  "vehicle_maintenance",
  "site_maintenance",
  "delivery_income",
  "fuel",
  "payroll",
  "rider_payout",
  "office_expense",
  "software",
  "tax",
  "insurance",
  "licensing_permits",
  "rent_utilities",
  "marketing",
  "customer_refund",
  "supplier_payment",
  "asset_purchase",
  "other"
]);

const directions = new Set(["income", "expense", "transfer"]);
const statuses = new Set(["pending", "cleared", "flagged"]);

const demoLogs = [
  {
    id: "CTL-1001",
    entry_date: new Date().toISOString().slice(0, 10),
    category: "delivery_income",
    direction: "income",
    amount_ngn: 486000,
    title: "Same-day delivery collections",
    counterparty: "Fast Fleets 360 customers",
    reference: "DAY-CLOSE",
    payment_method: "Wallet / Squad",
    status: "cleared",
    notes: "Daily delivery income summary.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  {
    id: "CTL-1002",
    entry_date: new Date().toISOString().slice(0, 10),
    category: "vehicle_maintenance",
    direction: "expense",
    amount_ngn: 73500,
    title: "Brake pads and oil service",
    counterparty: "Fleet garage",
    reference: "MAINT-042",
    payment_method: "Transfer",
    status: "pending",
    notes: "Two bikes serviced before evening shift.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
];

export async function GET() {
  if (!(await requireAdminSession())) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    if (canUseDemoFallback()) return NextResponse.json({ logs: demoLogs, demo: true });
    return NextResponse.json(missingServiceResponse("company transaction logs"), { status: 503 });
  }

  const { data, error } = await supabase
    .from("company_transaction_logs")
    .select("id, entry_date, category, direction, amount_ngn, title, counterparty, reference, payment_method, status, notes, created_at, updated_at")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(150);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ logs: data || [] });
}

export async function POST(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const parsed = parsePayload(await request.json().catch(() => ({})));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to save company transaction logs." }, { status: 503 });
  }

  const { data, error } = await supabase.from("company_transaction_logs").insert(parsed.log).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ log: data });
}

export async function PATCH(request: Request) {
  if (!(await requireAdminSession(request))) {
    return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Choose a transaction log to update." }, { status: 400 });

  const parsed = parsePayload(body, true);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Set SUPABASE_SERVICE_ROLE_KEY to update company transaction logs." }, { status: 503 });
  }

  const { data, error } = await supabase.from("company_transaction_logs").update(parsed.log).eq("id", id).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ log: data });
}

function parsePayload(body: Record<string, unknown>, partial = false): { log: CompanyTransactionInsert | CompanyTransactionUpdate } | { error: string } {
  const hasAmount = body.amount_ngn !== undefined || body.amount !== undefined;
  const entryDate = String(body.entry_date || body.entryDate || "").trim();
  const category = String(body.category || "").trim();
  const direction = String(body.direction || "").trim();
  const amount = Number(body.amount_ngn ?? body.amount);
  const title = String(body.title || "").trim();
  const status = String(body.status || (partial ? "" : "pending")).trim();

  if ((!partial || entryDate) && !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
    return { error: "Add a valid transaction date." };
  }
  if ((!partial || category) && !categories.has(category)) {
    return { error: "Choose a valid company transaction category." };
  }
  if ((!partial || direction) && !directions.has(direction)) {
    return { error: "Choose whether this is income, expense, or transfer." };
  }
  if ((!partial || hasAmount) && (!Number.isFinite(amount) || amount < 0)) {
    return { error: "Add a valid amount." };
  }
  if ((!partial || title) && title.length < 3) {
    return { error: "Add a clear transaction title." };
  }
  if ((!partial || status) && !statuses.has(status)) {
    return { error: "Choose a valid transaction status." };
  }

  const log = stripEmpty({
    entry_date: entryDate,
    category,
    direction,
    amount_ngn: hasAmount ? amount : undefined,
    title,
    counterparty: optionalText(body.counterparty),
    reference: optionalText(body.reference),
    payment_method: optionalText(body.payment_method || body.paymentMethod),
    status,
    notes: optionalText(body.notes)
  }) as CompanyTransactionInsert | CompanyTransactionUpdate;

  return { log };
}

function optionalText(value: unknown) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function stripEmpty<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== undefined)) as T;
}
