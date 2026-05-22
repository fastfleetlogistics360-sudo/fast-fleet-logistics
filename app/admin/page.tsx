import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from "@/lib/admin-auth";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminPanel } from "@/components/admin/admin-panel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin Panel"
};

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!isValidAdminSession(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)) {
    return <AdminLogin />;
  }
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return <AdminLogin />;

  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("user_id", user.id).maybeSingle<{ is_admin?: boolean | null }>();
  if (!profile?.is_admin) return <AdminLogin />;

  return <AdminPanel />;
}
