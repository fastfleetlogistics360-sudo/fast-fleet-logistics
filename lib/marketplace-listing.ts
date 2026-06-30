export type MarketplaceListingStatus = "submitted" | "accepted" | "rejected";

export type MarketplaceListingApplication = {
  id: string;
  business_profile_id: string;
  user_id: string;
  store_name: string;
  store_category: string;
  commission_rate: number | null;
  item_count: number;
  expected_average_orders: string;
  contact_email: string;
  whatsapp_number: string;
  status: MarketplaceListingStatus;
  rejection_reason: string | null;
  reviewed_by?: string | null;
  reviewed_at: string | null;
  retry_after: string | null;
  created_at: string;
  updated_at: string;
};

export function marketplaceListingStatusLabel(status: string | null | undefined) {
  if (status === "accepted") return "Accepted";
  if (status === "rejected") return "Rejected";
  return "Submitted";
}

export function addBusinessDays(start: Date, days: number) {
  const next = new Date(start);
  let added = 0;
  while (added < days) {
    next.setDate(next.getDate() + 1);
    const day = next.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return next;
}

export function canRetryMarketplaceListing(application?: { status?: string | null; retry_after?: string | null } | null, now = new Date()) {
  if (!application || application.status !== "rejected" || !application.retry_after) return true;
  return new Date(application.retry_after).getTime() <= now.getTime();
}

export function marketplaceListingRetryDate(application?: { retry_after?: string | null } | null) {
  if (!application?.retry_after) return "";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium"
  }).format(new Date(application.retry_after));
}
