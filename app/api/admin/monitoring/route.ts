import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { createAdminClient } from "@/lib/supabase/admin";

type ServiceState = "healthy" | "degraded" | "down";

type HealthCheck = {
  id: string;
  label: string;
  group: "customer" | "admin" | "fastErrand" | "drivers" | "payments" | "platform";
  state: ServiceState;
  detail: string;
  durationMs: number;
};

const stateWeight: Record<ServiceState, number> = { healthy: 0, degraded: 1, down: 2 };

export async function GET() {
  if (!(await requireAdminSession())) return response({ error: "Admin session required." }, 401);

  const db = createAdminClient();
  if (!db) return response({ error: "Monitoring needs SUPABASE_SERVICE_ROLE_KEY." }, 503);

  const checks = await Promise.all([
    runCheck("database", "Database connection", "platform", () => db.from("platform_settings").select("key", { count: "exact", head: true })),
    runCheck("site-controls", "Customer app controls", "customer", () => db.from("platform_settings").select("key", { count: "exact", head: true }).eq("key", "site_controls")),
    runCheck("admin-session", "Admin console", "admin", () => db.from("profiles").select("user_id", { count: "exact", head: true }).eq("is_admin", true)),
    runCheck("fast-errand-catalogue", "FastErrand catalogue", "fastErrand", () => db.from("fast_errand_catalog_items").select("id", { count: "exact", head: true }).eq("is_active", true)),
    runCheck("delivery-dispatch", "Delivery dispatch", "drivers", () => db.from("deliveries").select("id", { count: "exact", head: true }).not("status", "in", "(delivered,cancelled)")),
    runCheck("rider-operations", "Rider operations", "drivers", () => db.from("rider_profiles").select("id", { count: "exact", head: true })),
    runCheck("payment-intents", "Payment processing", "payments", () => db.from("payment_intents").select("id", { count: "exact", head: true }).in("status", ["initialized", "pending", "requires_review"])),
    runCheck("notifications", "Notifications", "platform", () => db.from("notifications").select("id", { count: "exact", head: true }))
  ]);

  const groupStates = Object.fromEntries(
    ["customer", "admin", "fastErrand", "drivers", "payments", "platform"].map((group) => [
      group,
      checks.filter((check) => check.group === group).reduce<ServiceState>((worst, check) => (stateWeight[check.state] > stateWeight[worst] ? check.state : worst), "healthy")
    ])
  ) as Record<HealthCheck["group"], ServiceState>;

  const overall = Object.values(groupStates).reduce<ServiceState>((worst, state) => (stateWeight[state] > stateWeight[worst] ? state : worst), "healthy");
  return response({ checkedAt: new Date().toISOString(), overall, groupStates, checks });
}

async function runCheck(
  id: string,
  label: string,
  group: HealthCheck["group"],
  query: () => PromiseLike<{ count?: number | null; error?: { message?: string } | null }>
): Promise<HealthCheck> {
  const startedAt = performance.now();
  try {
    const result = await query();
    const durationMs = Math.round(performance.now() - startedAt);
    if (result.error) return { id, label, group, state: "down", detail: "Check could not reach this service.", durationMs };
    const state: ServiceState = durationMs > 2500 ? "degraded" : "healthy";
    const count = typeof result.count === "number" ? `${result.count.toLocaleString()} records checked` : "Connection checked";
    return { id, label, group, state, detail: state === "degraded" ? "Responding slower than expected." : count, durationMs };
  } catch {
    return { id, label, group, state: "down", detail: "Check could not reach this service.", durationMs: Math.round(performance.now() - startedAt) };
  }
}

function response(body: Record<string, unknown>, status = 200) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store, max-age=0");
  return result;
}
