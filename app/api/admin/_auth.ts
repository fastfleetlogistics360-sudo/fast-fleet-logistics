import { cookies } from "next/headers";
import {
  ADMIN_SESSION_COOKIE,
  AdminAuthConfigurationError,
  isSameOriginAdminMutation,
  isAuthorizedAdminState,
  type SupabaseAdminAuthorityState,
  verifyAdminSession
} from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export type TrustedAdminContext = {
  userId: string;
};

export async function requireAdminSession(request?: Request): Promise<TrustedAdminContext | null> {
  try {
    if (request && !isSameOriginAdminMutation(request)) return null;

    const cookieStore = await cookies();
    const session = verifyAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
    if (!session) return null;

    return (await hasCurrentSupabaseAdminAuthority(session.userId)) ? { userId: session.userId } : null;
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      console.error(`[admin-auth] ${error.message}`);
    } else {
      console.error("[admin-auth] Admin authorization check failed.");
    }
    return null;
  }
}

export async function hasCurrentSupabaseAdminAuthority(
  userId: string,
  lookup: (userId: string) => Promise<SupabaseAdminAuthorityState> = lookupSupabaseAdminAuthority
) {
  return isAuthorizedAdminState(userId, await lookup(userId));
}

async function lookupSupabaseAdminAuthority(userId: string): Promise<SupabaseAdminAuthorityState> {
  const supabase = createAdminClient();
  if (!supabase) return { authUser: null, profile: null, failed: true };

  const [{ data: authData, error: authError }, { data: profile, error: profileError }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("profiles")
      .select("user_id, is_admin, deleted_at")
      .eq("user_id", userId)
      .maybeSingle<{ user_id?: string | null; is_admin?: boolean | null; deleted_at?: string | null }>()
  ]);

  const authUser = authData?.user as (typeof authData.user & { banned_until?: string | null; deleted_at?: string | null }) | null;
  return {
    authUser: authUser
      ? { id: authUser.id, bannedUntil: authUser.banned_until, deletedAt: authUser.deleted_at }
      : null,
    profile: profile
      ? { userId: profile.user_id, isAdmin: profile.is_admin, deletedAt: profile.deleted_at }
      : null,
    failed: Boolean(authError || profileError)
  };
}
