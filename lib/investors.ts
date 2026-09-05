import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type InvestorStatus = "invited" | "onboarding" | "active" | "suspended";

export type InvestorProfile = {
  id: string;
  user_id: string;
  investor_code: string;
  status: InvestorStatus;
  onboarding_completed_at?: string | null;
  suspended_at?: string | null;
};

export function createInvestorCode() {
  return `INV-${randomBytes(6).toString("hex").toUpperCase()}`;
}

export function investorStatusLabel(status: string | null | undefined) {
  if (status === "active") return "Active";
  if (status === "onboarding") return "Finish setup";
  if (status === "suspended") return "Suspended";
  return "Invitation pending";
}

export async function loadInvestorProfileForUser(database: SupabaseClient, userId: string) {
  const { data, error } = await database
    .from("investor_profiles")
    .select("id, user_id, investor_code, status, onboarding_completed_at, suspended_at")
    .eq("user_id", userId)
    .maybeSingle<InvestorProfile>();
  if (error) throw error;
  return data || null;
}

export function safeText(value: unknown, maximum = 160) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

export function uniqueIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && /^[0-9a-f-]{36}$/i.test(item)))];
}
