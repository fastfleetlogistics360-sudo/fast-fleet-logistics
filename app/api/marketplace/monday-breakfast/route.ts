import { NextResponse } from "next/server";
import { resolveMarketplaceBusinessLinks, type MarketplaceCheckoutItem } from "@/lib/marketplace-business-links";
import { resolveMarketplaceVendorForCheckout } from "@/lib/marketplace-vendors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Public display data only; checkout performs the locked final reservation. */
export async function POST(request: Request) {
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ eligible: false, subsidyNgn: 0 });
  const body = await request.json().catch(() => ({})) as { kind?: unknown; items?: MarketplaceCheckoutItem[] };
  // This endpoint is intentionally a hard no-op for Shopping, before any
  // eligibility, allocation, or pricing code can run.
  if (body.kind !== "restaurant") return NextResponse.json({ eligible: false, subsidyNgn: 0 });
  const db = createAdminClient();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!db || !items.length) return NextResponse.json({ eligible: false, subsidyNgn: 0 });
  try {
    const links = await resolveMarketplaceBusinessLinks(db, "restaurant", items);
    const vendor = await resolveMarketplaceVendorForCheckout(db, "restaurant", links.items);
    const foodSubtotalKobo = Math.max(0, Math.round(links.items.reduce((sum, item) => sum + Number(item.subtotal || 0), 0) * 100));
    const { data, error } = await db.rpc("quote_monday_free_breakfast", { target_vendor_id: vendor.vendor.id, target_customer_id: user.id, food_subtotal_kobo: foodSubtotalKobo });
    if (error) throw error;
    const quote = (data || {}) as { eligible?: boolean; subsidy_kobo?: number };
    return NextResponse.json({ eligible: quote.eligible === true, subsidyNgn: Math.max(0, Number(quote.subsidy_kobo || 0)) / 100 });
  } catch {
    return NextResponse.json({ eligible: false, subsidyNgn: 0 });
  }
}
