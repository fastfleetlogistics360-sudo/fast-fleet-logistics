import type { SupabaseClient } from "@supabase/supabase-js";
import type { MarketplaceCheckoutItem } from "@/lib/marketplace-business-links";

type MarketplaceKind = "restaurant" | "shopping";

type VendorRow = {
  id: string;
  source_kind: MarketplaceKind;
  legacy_menu_id: string;
  display_name: string;
  lifecycle_status: "active" | "paused" | "archived";
  operational_mode: "fastfleet_managed" | "self_managed";
  linked_business_profile_id?: string | null;
};

type BranchRow = {
  id: string;
  marketplace_vendor_id: string;
  legacy_branch_key: string;
  state?: string | null;
  operational_area?: string | null;
  pickup_address?: string | null;
  pickup_place_id?: string | null;
  pickup_latitude?: number | string | null;
  pickup_longitude?: number | string | null;
  pickup_instructions?: string | null;
  operational_status: "open" | "closed" | "paused";
};

export type MarketplaceVendorResolution = {
  vendor: VendorRow;
  branch: BranchRow;
  snapshot: Record<string, unknown>;
};

/** Resolves menu IDs—not client names or business links—to Phase 1 identity. */
export async function resolveMarketplaceVendorForCheckout(
  db: SupabaseClient,
  kind: MarketplaceKind | undefined,
  items: MarketplaceCheckoutItem[]
): Promise<MarketplaceVendorResolution> {
  const sourceKind: MarketplaceKind = kind === "shopping" ? "shopping" : "restaurant";
  const menuIds = Array.from(new Set(items.map((item) => text(item.vendorId || item.storeId)).filter(Boolean)));
  if (menuIds.length !== 1) throw new MarketplaceVendorResolutionError("Checkout items must belong to one marketplace vendor.");

  const { data: vendors, error: vendorError } = await db
    .from("marketplace_vendors")
    .select("id, source_kind, legacy_menu_id, display_name, lifecycle_status, operational_mode, linked_business_profile_id")
    .eq("source_kind", sourceKind)
    .eq("legacy_menu_id", menuIds[0]);
  if (vendorError) throw vendorError;
  if (!vendors || vendors.length !== 1) throw new MarketplaceVendorResolutionError("This marketplace vendor is not ready for checkout. Please try again shortly.");
  const vendor = vendors[0] as VendorRow;
  if (vendor.lifecycle_status !== "active") throw new MarketplaceVendorResolutionError(`${vendor.display_name} is not accepting orders.`, 409);

  const requestedStates = Array.from(new Set(items.map((item) => text(item.vendorState)).filter(Boolean)));
  if (requestedStates.length > 1) throw new MarketplaceVendorResolutionError("Checkout items must come from one vendor branch at a time.");
  const requestedState = requestedStates[0] || "";
  const { data: branches, error: branchError } = await db
    .from("marketplace_vendor_branches")
    .select("id, marketplace_vendor_id, legacy_branch_key, state, operational_area, pickup_address, pickup_place_id, pickup_latitude, pickup_longitude, pickup_instructions, operational_status")
    .eq("marketplace_vendor_id", vendor.id)
    .eq("operational_status", "open");
  if (branchError) throw branchError;
  const matches = (branches || []).filter((branch) => !requestedState || text(branch.state).toLowerCase() === requestedState.toLowerCase());
  if (matches.length !== 1) throw new MarketplaceVendorResolutionError("The selected marketplace vendor branch is unavailable. Please refresh and try again.");
  const branch = matches[0] as BranchRow;
  return {
    vendor,
    branch,
    snapshot: {
      schema_version: 1,
      vendor_id: vendor.id,
      legacy_menu_id: vendor.legacy_menu_id,
      display_name: vendor.display_name,
      marketplace_kind: vendor.source_kind,
      operational_mode: vendor.operational_mode,
      branch_id: branch.id,
      legacy_branch_key: branch.legacy_branch_key,
      state: branch.state || null,
      operational_area: branch.operational_area || null,
      pickup_address: branch.pickup_address || null,
      pickup_place_id: branch.pickup_place_id || null,
      pickup_latitude: branch.pickup_latitude == null ? null : Number(branch.pickup_latitude),
      pickup_longitude: branch.pickup_longitude == null ? null : Number(branch.pickup_longitude),
      pickup_instructions: branch.pickup_instructions || null,
      captured_at: new Date().toISOString()
    }
  };
}

export class MarketplaceVendorResolutionError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
