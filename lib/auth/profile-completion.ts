import type { createServerClient } from "@supabase/ssr";
import { normalizeState } from "@/lib/launch-states";
import type { UserRole } from "@/types/domain";

type SupabaseServerClient = ReturnType<typeof createServerClient>;

type AuthUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  created_at?: string;
  user_metadata?: Record<string, any>;
};

export async function upsertRoleProfile(supabase: SupabaseServerClient, user: AuthUser, role: UserRole) {
  const now = new Date().toISOString();
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Fast Fleets 360 user";
  const selectedState = role === "customer" ? normalizeState(user.user_metadata?.state || user.user_metadata?.default_zone) || "Lagos" : "Lagos";

  await Promise.allSettled([
    supabase.auth.updateUser({ data: { account_type: role, role, default_zone: selectedState, state: role === "customer" ? selectedState : undefined } }),
    supabase.from("users").upsert({
      id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      full_name: fullName,
      role,
      default_zone: selectedState,
      updated_at: now
    }),
    supabase.from("profiles").upsert({
      id: user.id,
      user_id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      full_name: fullName,
      account_type: role,
      lga: selectedState,
      updated_at: now
    })
  ]);
}
