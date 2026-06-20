import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuickActionHub } from "@/components/hub/quick-action-hub";
import { parseUserRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "App Hub"
};

export default async function HubPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth?returnTo=/hub");

  const [{ data: profile }, { data: account }] = await Promise.all([
    supabase.from("profiles").select("account_type, avatar_url").eq("user_id", user.id).maybeSingle<{ account_type?: string | null; avatar_url?: string | null }>(),
    supabase.from("users").select("full_name, email, avatar_url").eq("id", user.id).maybeSingle<{ full_name?: string | null; email?: string | null; avatar_url?: string | null }>()
  ]);

  const role = parseUserRole(profile?.account_type || user.user_metadata?.account_type || user.user_metadata?.role);
  if (!role) redirect("/choose-account-type?returnTo=/hub");

  return (
    <QuickActionHub
      role={role}
      fullName={account?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null}
      email={account?.email || user.email || null}
      avatarUrl={account?.avatar_url || profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null}
    />
  );
}
