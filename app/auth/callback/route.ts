import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { normalizeRole } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const returnTo = requestUrl.searchParams.get("returnTo") || "/dashboard";
  const role = normalizeRole(requestUrl.searchParams.get("role"));
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  let response = NextResponse.redirect(new URL(safeReturnTo, request.url));

  const { url, anonKey } = getSupabasePublicConfig();
  if (!code || !url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.redirect(new URL(safeReturnTo, request.url));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) {
    const { data } = await supabase.auth.getUser();
    const user = data.user;
    if (user) {
      await supabase.from("users").upsert({
        id: user.id,
        email: user.email || "",
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "FastFleet user",
        role,
        default_zone: "Lagos",
        updated_at: new Date().toISOString()
      });
    }
  }

  return response;
}
