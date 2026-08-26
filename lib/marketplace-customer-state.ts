import { normalizeState } from "@/lib/launch-states";
import { createClient } from "@/lib/supabase/server";

/** The signed-in customer's saved state is used only to order marketplace branches. */
export async function loadMarketplaceCustomerState() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const [profile, appUser] = await Promise.all([
      supabase.from("profiles").select("lga").eq("user_id", user.id).maybeSingle<{ lga?: string | null }>(),
      supabase.from("users").select("default_zone").eq("id", user.id).maybeSingle<{ default_zone?: string | null }>()
    ]);
    return normalizeState(profile.data?.lga || appUser.data?.default_zone) || null;
  } catch {
    return null;
  }
}
