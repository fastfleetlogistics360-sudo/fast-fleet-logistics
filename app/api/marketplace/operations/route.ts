import { NextRequest, NextResponse } from "next/server";
import { activeMarketplaceOperatorMemberships } from "@/lib/marketplace-operator-auth";
import { marketplaceOperationsOrderSelect } from "@/lib/marketplace-order-workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const attentionStatuses = ["pending", "received", "preparing", "packing", "ready_for_pickup"];
const terminalStatuses = ["delivered", "cancelled"];
const pageSize = 25;

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Please sign in to access Marketplace Operations." }, { status: 401 });
    const db = createAdminClient();
    if (!db) return NextResponse.json({ error: "Marketplace Operations is not configured." }, { status: 503 });
    const memberships = await activeMarketplaceOperatorMemberships(db, user.id);
    if (!memberships.length) return NextResponse.json({ error: "Marketplace operator access is required." }, { status: 403 });

    const { data: allManagedVendors, error: vendorsError } = await db
      .from("marketplace_vendors")
      .select("id, display_name, source_kind, marketplace_category, operational_mode, lifecycle_status, managed_by_fastfleet, linked_business_profile_id")
      .eq("operational_mode", "fastfleet_managed")
      .eq("managed_by_fastfleet", true)
      .order("display_name", { ascending: true })
      .limit(100);
    if (vendorsError) throw vendorsError;
    const allVendorAccess = memberships.some((membership) => membership.all_vendors);
    const scopedVendorIds = new Set(memberships.map((membership) => membership.marketplace_vendor_id).filter((id): id is string => Boolean(id)));
    const vendors = (allManagedVendors || []).filter((vendor) => allVendorAccess || scopedVendorIds.has(String(vendor.id)));
    const allowedVendorIds = vendors.map((vendor) => String(vendor.id));
    const vendorId = request.nextUrl.searchParams.get("vendor")?.trim() || null;
    if (vendorId && !allowedVendorIds.includes(vendorId)) return NextResponse.json({ error: "That vendor is outside your Marketplace Operations scope." }, { status: 403 });

    const counts = await Promise.all(vendors.map(async (vendor) => {
      const [attention, active, branches] = await Promise.all([
        db.from("orders").select("id", { count: "exact", head: true }).eq("marketplace_vendor_id", vendor.id).eq("payment_status", "paid").in("status", attentionStatuses),
        db.from("orders").select("id", { count: "exact", head: true }).eq("marketplace_vendor_id", vendor.id).not("status", "in", `(${terminalStatuses.join(",")})`),
        db.from("marketplace_vendor_branches").select("id, legacy_branch_key, state, operational_area, pickup_address, operational_status").eq("marketplace_vendor_id", vendor.id).order("legacy_branch_key", { ascending: true }).limit(20)
      ]);
      if (attention.error) throw attention.error;
      if (active.error) throw active.error;
      if (branches.error) throw branches.error;
      return { ...vendor, attention_count: attention.count || 0, active_order_count: active.count || 0, branches: branches.data || [] };
    }));

    const status = request.nextUrl.searchParams.get("status")?.trim() || "attention";
    const search = request.nextUrl.searchParams.get("q")?.trim().slice(0, 80) || "";
    const page = Math.max(0, Number(request.nextUrl.searchParams.get("page") || 0));
    const { count: allOrderCount, error: allOrderCountError } = allowedVendorIds.length
      ? await db.from("orders").select("id", { count: "exact", head: true }).in("marketplace_vendor_id", allowedVendorIds)
      : { count: 0, error: null };
    if (allOrderCountError) throw allOrderCountError;
    let orders: unknown[] = [];
    let total = 0;
    if (allowedVendorIds.length) {
      let query = db.from("orders").select(marketplaceOperationsOrderSelect, { count: "exact" }).in("marketplace_vendor_id", vendorId ? [vendorId] : allowedVendorIds).order("created_at", { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      if (status === "attention") query = query.eq("payment_status", "paid").in("status", attentionStatuses);
      else if (status !== "all") query = query.eq("status", status);
      if (search) query = query.ilike("order_code", `%${escapeLike(search)}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      orders = data || [];
      total = count || 0;
    }
    return NextResponse.json({
      role: memberships.some((membership) => membership.role === "manager") ? "manager" : "operator",
      vendors: counts,
      selected_vendor_id: vendorId,
      orders,
      pagination: { page, page_size: pageSize, total },
      attention_count: counts.reduce((sum, vendor) => sum + Number(vendor.attention_count || 0), 0),
      all_order_count: allOrderCount || 0,
      attention_definition: "Verified paid orders in pending, received, preparing, packing, or ready_for_pickup. This is needs-action, not an overdue SLA."
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load Marketplace Operations." }, { status: 500 });
  }
}

function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
