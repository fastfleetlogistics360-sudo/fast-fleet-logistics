import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { QuickActionHub } from "@/components/hub/quick-action-hub";
import { parseSelfServiceRole, parseUserRole } from "@/lib/auth/roles";
import { HUB_TOUR_VERSION } from "@/lib/hub-tour";
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

  // Keep the server gate intentionally small. The action grid can now render
  // as soon as identity and role are known; secondary Hub data loads in the
  // background from the client after the page is visible.
  const { data: profile } = await supabase
    .from("profiles")
    .select("account_type, avatar_url, full_name, email, hub_tour_version")
    .eq("user_id", user.id)
    .maybeSingle<{
      account_type?: string | null;
      avatar_url?: string | null;
      full_name?: string | null;
      email?: string | null;
      hub_tour_version?: number | null;
    }>();

  const role = parseUserRole(profile?.account_type) || parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
  if (!role) redirect("/choose-account-type?returnTo=/hub");

  return (
    <QuickActionHub
      role={role}
      fullName={profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null}
      email={profile?.email || user.email || null}
      avatarUrl={profile?.avatar_url || user.user_metadata?.avatar_url || user.user_metadata?.picture || null}
      shouldShowTour={Number(profile?.hub_tour_version || 0) < HUB_TOUR_VERSION}
    />
  );
}
