import type { SupabaseClient } from "@supabase/supabase-js";

export type IntelligencePeriod = 7 | 30 | 90;
export type IntelligenceSeverity = "info" | "watch" | "high";
export type IntelligenceInsight = { title: string; description: string; severity: IntelligenceSeverity; department: string; metric: string; periodDays: IntelligencePeriod; evidence: string; recommendation: string };
export type IntelligenceMetric = { label: string; value: number | null; format: "number" | "percent" | "currency" | "duration"; note?: string };
export type BusinessIntelligence = {
  generatedAt: string; periodDays: IntelligencePeriod; overview: IntelligenceMetric[]; deliveries: IntelligenceMetric[]; users: IntelligenceMetric[]; riders: IntelligenceMetric[]; vendors: IntelligenceMetric[]; financial: IntelligenceMetric[]; marketplace: IntelligenceMetric[];
  trends: Array<{ date: string; deliveries: number; registrations: number }>;
  insights: IntelligenceInsight[]; recommendations: IntelligenceInsight[]; unavailable: string[];
};

type TimestampRow = { created_at?: string | null; delivered_at?: string | null; accepted_at?: string | null; status?: string | null; amount_ngn?: number | string | null; transaction_type?: string | null; online?: boolean | null; application_status?: string | null; registration_status?: string | null; lifecycle_status?: string | null; operational_status?: string | null; direction?: string | null; category?: string | null; amount?: number | string | null; payment_status?: string | null; status_text?: string | null };
const n = (value: unknown) => Math.max(0, Number(value || 0));
const metric = (label: string, value: number | null, format: IntelligenceMetric["format"], note?: string): IntelligenceMetric => ({ label, value: value === null ? null : Math.round(value * 100) / 100, format, note });
const dateKey = (value: string) => value.slice(0, 10);

export function parseIntelligencePeriod(value: string | null): IntelligencePeriod { if (value === "7") return 7; if (value === "90") return 90; return 30; }

export async function loadBusinessIntelligence(db: SupabaseClient, periodDays: IntelligencePeriod, options: { includeFinancial?: boolean; asOf?: Date } = {}): Promise<BusinessIntelligence> {
  const includeFinancial = options.includeFinancial === true;
  const now = options.asOf || new Date(); const since = new Date(now.getTime() - periodDays * 86400000).toISOString();
  // Dynamic, approved table names cannot retain Supabase's generated table generic here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = async (table: string, filter?: (q: any) => any) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = db.from(table).select("id", { count: "exact", head: true });
    if (filter) query = filter(query);
    const { count: result, error } = await query; if (error) throw error; return result || 0;
  };
  const [totalUsers, newUsers, totalDeliveries, completedDeliveries, pendingDeliveries, cancelledDeliveries, totalRiders, activeRiders, totalBusinesses, activeBusinesses, marketplaceVendors, activeMarketplaceVendors, catalogueItems, fastErrands, transactionRows, failedTransactions, successfulTransactions, recentUsers, recentDeliveries, completedTiming, riderRows, companyRevenueRows] = await Promise.all([
    count("users"), count("users", q => q.gte("created_at", since)),
    count("deliveries"), count("deliveries", q => q.eq("status", "delivered")), count("deliveries", q => q.in("status", ["draft", "pending", "assigned", "accepted", "picked_up", "in_transit"])), count("deliveries", q => q.eq("status", "cancelled")),
    count("rider_profiles"), count("rider_profiles", q => q.eq("online", true).eq("application_status", "approved")),
    count("business_profiles"), count("business_profiles", q => q.eq("registration_status", "active")),
    count("marketplace_vendors"), count("marketplace_vendors", q => q.eq("lifecycle_status", "active")), count("fast_errand_catalog_items", q => q.eq("is_active", true)), count("fast_errand_orders", q => q.gte("created_at", since)),
    includeFinancial ? db.from("transactions").select("transaction_type, amount_ngn, status, created_at").gte("created_at", since).limit(5000) : Promise.resolve({ data: [], error: null }),
    includeFinancial ? count("transactions", q => q.eq("status", "failed").gte("created_at", since)) : Promise.resolve(0), includeFinancial ? count("transactions", q => q.eq("status", "successful").gte("created_at", since)) : Promise.resolve(0),
    db.from("users").select("created_at").gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
    db.from("deliveries").select("created_at, status").gte("created_at", since).order("created_at", { ascending: true }).limit(5000),
    db.from("deliveries").select("accepted_at, delivered_at").eq("status", "delivered").gte("delivered_at", since).not("accepted_at", "is", null).not("delivered_at", "is", null).limit(5000),
    db.from("rider_profiles").select("operating_zone, online, completed_deliveries, application_status").eq("application_status", "approved").limit(5000),
    includeFinancial ? db.from("company_transaction_logs").select("direction, category, amount_ngn, status").eq("status", "cleared").eq("direction", "income").gte("entry_date", since.slice(0, 10)).limit(5000) : Promise.resolve({ data: [], error: null })
  ]);
  for (const result of [transactionRows, recentUsers, recentDeliveries, completedTiming, riderRows, companyRevenueRows]) if (result.error) throw result.error;
  const transactions = (transactionRows.data || []) as TimestampRow[];
  const companyRevenue = ((companyRevenueRows.data || []) as TimestampRow[]).reduce((sum, row) => sum + n(row.amount_ngn), 0);
  const platformCommission = transactions.filter(row => row.transaction_type === "commission" && row.status === "successful").reduce((sum, row) => sum + n(row.amount_ngn), 0);
  const riderPayouts = transactions.filter(row => row.transaction_type === "rider_earning" && row.status === "successful").reduce((sum, row) => sum + n(row.amount_ngn), 0);
  const completionRate = totalDeliveries ? completedDeliveries / totalDeliveries * 100 : 0;
  const transactionTotal = successfulTransactions + failedTransactions;
  const transactionSuccessRate = transactionTotal ? successfulTransactions / transactionTotal * 100 : null;
  const timings = (completedTiming.data || []).map((row: { accepted_at?: string | null; delivered_at?: string | null }) => row.accepted_at && row.delivered_at ? (new Date(row.delivered_at).getTime() - new Date(row.accepted_at).getTime()) / 60000 : null).filter((value): value is number => value !== null && value >= 0 && value < 1440);
  const averageCompletionMinutes = timings.length ? timings.reduce((sum, value) => sum + value, 0) / timings.length : null;
  const trend = new Map<string, { deliveries: number; registrations: number }>();
  for (let i = periodDays - 1; i >= 0; i--) { const key = dateKey(new Date(now.getTime() - i * 86400000).toISOString()); trend.set(key, { deliveries: 0, registrations: 0 }); }
  for (const row of (recentUsers.data || []) as TimestampRow[]) if (row.created_at && trend.has(dateKey(row.created_at))) trend.get(dateKey(row.created_at))!.registrations++;
  for (const row of (recentDeliveries.data || []) as TimestampRow[]) if (row.created_at && trend.has(dateKey(row.created_at))) trend.get(dateKey(row.created_at))!.deliveries++;
  const trendRows = [...trend.entries()].map(([date, value]) => ({ date, ...value }));
  const approvedRiders = (riderRows.data || []) as Array<{ operating_zone?: string | null; online?: boolean | null; completed_deliveries?: number | null }>;
  const zones = new Set(approvedRiders.map(row => row.operating_zone).filter(Boolean));
  const onlineRiders = approvedRiders.filter(row => row.online).length;
  const insights = buildInsights({ periodDays, completionRate, cancelledDeliveries, totalDeliveries, averageCompletionMinutes, newUsers, completedDeliveries, onlineRiders, activeBusinesses, transactionSuccessRate });
  const unavailable = ["Delivery fee totals are unavailable: deliveries and marketplace orders can represent the same fulfilment and must not be summed.", "Outstanding payments are unavailable: payment obligations do not have a single reconciled authoritative balance in the approved source tables."];
  if (!includeFinancial) unavailable.push("Financial intelligence is restricted to the FAST AI Super Admin role.");
  return {
    generatedAt: now.toISOString(), periodDays,
    overview: [metric("Registered users", totalUsers, "number"), metric(`New users (${periodDays}d)`, newUsers, "number"), metric("Total deliveries", totalDeliveries, "number"), metric("Completed deliveries", completedDeliveries, "number"), metric("Delivery completion rate", completionRate, "percent")],
    deliveries: [metric("Completed", completedDeliveries, "number"), metric("Pending / active", pendingDeliveries, "number"), metric("Cancelled", cancelledDeliveries, "number"), metric("Average completion time", averageCompletionMinutes, "duration", averageCompletionMinutes === null ? "No completed deliveries with both accepted and delivered timestamps in this period." : undefined)],
    users: [metric("Registered users", totalUsers, "number"), metric(`Registrations (${periodDays}d)`, newUsers, "number")],
    riders: [metric("Registered riders", totalRiders, "number"), metric("Active / online approved riders", activeRiders, "number"), metric("Operating zones recorded", zones.size, "number"), metric("Completed deliveries per approved rider", approvedRiders.length ? completedDeliveries / approvedRiders.length : null, "number")],
    vendors: [metric("Registered businesses", totalBusinesses, "number"), metric("Active businesses", activeBusinesses, "number"), metric("Marketplace vendors", marketplaceVendors, "number"), metric("Active marketplace vendors", activeMarketplaceVendors, "number")],
    financial: includeFinancial ? [metric(`Recorded company income (${periodDays}d)`, companyRevenue, "currency", "From cleared company transaction logs only."), metric(`Platform commissions (${periodDays}d)`, platformCommission, "currency", "From successful transaction records only."), metric(`Recorded rider earnings (${periodDays}d)`, riderPayouts, "currency", "This is recorded earnings, not proof of completed payout."), metric("Transaction success rate", transactionSuccessRate, "percent")] : [metric("Financial intelligence", null, "currency", "Restricted to FAST AI Super Admin.")],
    marketplace: [metric("Active catalogue items", catalogueItems, "number"), metric(`FastErrands created (${periodDays}d)`, fastErrands, "number"), metric("Marketplace vendors", marketplaceVendors, "number")],
    trends: trendRows, insights, recommendations: insights.map(({ title, recommendation, severity, department, metric: supportingMetric, periodDays: days, evidence }) => ({ title: `Recommendation: ${title}`, description: recommendation, severity, department, metric: supportingMetric, periodDays: days, evidence, recommendation })), unavailable
  };
}

function buildInsights(input: { periodDays: IntelligencePeriod; completionRate: number; cancelledDeliveries: number; totalDeliveries: number; averageCompletionMinutes: number | null; newUsers: number; completedDeliveries: number; onlineRiders: number; activeBusinesses: number; transactionSuccessRate: number | null }): IntelligenceInsight[] {
  const items: IntelligenceInsight[] = [];
  const add = (title: string, description: string, severity: IntelligenceSeverity, department: string, metricName: string, evidence: string, recommendation: string) => items.push({ title, description, severity, department, metric: metricName, periodDays: input.periodDays, evidence, recommendation });
  if (input.totalDeliveries && input.completionRate < 75) add("Delivery completion needs attention", "The observed completion rate is below the 75% watch threshold.", "high", "Rider Operations", "Delivery completion rate", `${input.completionRate.toFixed(1)}% across ${input.totalDeliveries} delivery records.`, "Review cancellation reasons, rider acceptance flow, and delivery-state transitions; do not change assignments automatically.");
  if (input.totalDeliveries && input.cancelledDeliveries / input.totalDeliveries >= 0.15) add("Elevated delivery cancellations", "Cancellations exceed the 15% watch threshold.", "watch", "Rider Operations", "Cancellation rate", `${input.cancelledDeliveries} cancelled of ${input.totalDeliveries} deliveries.`, "Review cancellation drivers by operating area and booking stage.");
  if (input.averageCompletionMinutes !== null && input.averageCompletionMinutes > 120) add("Long average completion time", "Completed deliveries are averaging more than two hours from acceptance to delivery.", "watch", "Rider Operations", "Average completion time", `${input.averageCompletionMinutes.toFixed(0)} minutes in the selected period.`, "Review route coverage and rider availability in affected areas.");
  if (input.newUsers >= 20 && input.completedDeliveries / input.newUsers < 0.5) add("Registration-to-delivery conversion gap", "User registrations outpace completed deliveries in the selected period.", "watch", "Marketing", "Registrations versus completed deliveries", `${input.newUsers} registrations and ${input.completedDeliveries} completed deliveries.`, "Review onboarding and ordering journey friction; treat this as a hypothesis, not a causal finding.");
  if (input.onlineRiders === 0 && input.totalDeliveries > 0) add("No online approved riders recorded", "Demand exists but no approved rider is currently marked online.", "high", "Rider Operations", "Online rider availability", "0 approved riders online at query time.", "Verify rider availability reporting and coverage operations before taking action.");
  if (input.activeBusinesses === 0) add("No active business profiles recorded", "No business profile is currently marked active.", "watch", "Vendor Management", "Active businesses", "0 active business profiles.", "Review vendor onboarding status and whether marketplace vendors are managed independently.");
  if (input.transactionSuccessRate !== null && input.transactionSuccessRate < 85) add("Transaction success rate is below threshold", "Recorded transaction success is below the 85% watch threshold.", "watch", "Finance", "Transaction success rate", `${input.transactionSuccessRate.toFixed(1)}% successful transactions.`, "Review provider responses and reconciliation records; do not retry or charge customers from FAST AI.");
  if (!items.length) add("No material rule-based anomaly detected", "Configured Phase 2A thresholds were not breached in the selected period.", "info", "Executive Intelligence", "Rule-based assessment", "Available approved metrics are within configured watch thresholds.", "Continue monitoring. This is deterministic analysis, not a model-generated conclusion.");
  return items;
}
