function staffedAt(date: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).formatToParts(date).find((part) => part.type === "hour")?.value || "0");
  return hour >= 8 && hour < 20;
}

export const supportQueues = ["customer_care_operations", "payments_finance", "rider_fleet_operations", "business_support", "safety_risk"] as const;
export type SupportQueue = (typeof supportQueues)[number];
export const supportPersonas = ["customer", "rider", "business", "investor"] as const;
export type SupportPersona = (typeof supportPersonas)[number];
export const supportPriorities = ["normal", "high", "urgent"] as const;

const categories: Record<SupportPersona, Record<string, readonly string[]>> = {
  customer: { delivery: ["rider_delayed", "rider_did_not_arrive", "delivery_status_problem", "delivery_marked_complete_incorrectly", "other"], order: ["order_not_progressing", "wrong_item", "missing_item", "damaged_item", "vendor_preparation_delay", "other"], payment: ["payment_failed", "charged_not_confirmed", "duplicate_payment", "verification", "other"], account: ["login_access", "profile", "verification_kyc", "restriction", "other"], storage: ["booking", "payment", "access", "extension", "facility_issue"], safety: ["unsafe_delivery", "threat_harassment", "accident", "emergency"], other: ["general"] },
  rider: { rider: ["delivery_job", "pin", "earnings", "vehicle_bicycle", "account_kyc", "safety", "other"], account: ["login_access", "verification_kyc", "other"], safety: ["unsafe_delivery", "threat_harassment", "accident", "emergency"], other: ["general"] },
  business: { business: ["kyc", "listing", "marketplace_order", "preparation", "payment_payout", "rider_issue", "account_issue"], payment: ["payment_failed", "verification", "other"], safety: ["unsafe_delivery", "other"], other: ["general"] },
  investor: { investor: ["fleet_asset", "rider_assignment", "earnings", "maintenance", "payout_withdrawal", "dashboard_discrepancy"], account: ["login_access", "other"], other: ["general"] }
};

export function isSupportQueue(value: unknown): value is SupportQueue { return typeof value === "string" && (supportQueues as readonly string[]).includes(value); }
export function isSupportPersona(value: unknown): value is SupportPersona { return typeof value === "string" && (supportPersonas as readonly string[]).includes(value); }
export function validCategory(persona: SupportPersona, category: unknown, subcategory: unknown) {
  return Boolean(typeof category === "string" && typeof subcategory === "string" && categories[persona][category]?.includes(subcategory));
}
export function defaultQueue(category: string): SupportQueue { if (category === "payment") return "payments_finance"; if (category === "rider") return "rider_fleet_operations"; if (category === "business") return "business_support"; if (category === "safety") return "safety_risk"; return "customer_care_operations"; }
export function defaultPriority(category: string) { return category === "safety" ? "urgent" : ["delivery", "order", "payment", "rider", "business"].includes(category) ? "high" : "normal"; }

function nextStaffedMinute(date: Date) { const result = new Date(date); while (!staffedAt(result)) result.setTime(result.getTime() + 60_000); return result; }
export function addStaffedMinutes(start: Date, minutes: number) { let result = new Date(start); let remaining = minutes; while (remaining > 0) { result = nextStaffedMinute(result); result.setTime(result.getTime() + 60_000); remaining--; } return result; }
export function slaDeadlines(priority: "normal" | "high" | "urgent", start = new Date()) { const targets = priority === "urgent" ? [15, 240] : priority === "high" ? [60, 720] : [480, 1440]; return { firstResponseAt: addStaffedMinutes(start, targets[0]), resolutionAt: addStaffedMinutes(start, targets[1]) }; }
export function slaState(deadline: string | null, now = new Date()) { if (!deadline) return "on_track"; const delta = new Date(deadline).getTime() - now.getTime(); if (delta < 0) return "breached"; if (delta <= 60 * 60 * 1000) return "at_risk"; return "on_track"; }
