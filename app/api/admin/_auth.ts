import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

export async function requireAdminSession() {
  const cookieStore = await cookies();
  if (!isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) return false;
  if (process.env.FASTFLEET_ADMIN_REQUIRE_SUPABASE_PROFILE !== "true") return true;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle<{ is_admin?: boolean | null }>();
  return Boolean(profile?.is_admin);
}
