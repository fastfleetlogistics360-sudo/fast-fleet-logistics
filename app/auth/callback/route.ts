import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { parseUserRole, roleHome, safeDashboardRedirectForRole } from "@/lib/auth/roles";
import type { UserRole } from "@/types/domain";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedReturnTo = requestUrl.searchParams.get("returnTo");
  const requestedRole = parseUserRole(requestUrl.searchParams.get("role"));
  const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToAuth(request, requestedReturnTo, providerError);
  }

  const { url, anonKey } = getSupabasePublicConfig();
  if (!code || !url || !anonKey) {
    return redirectToAuth(request, requestedReturnTo, "OAuth sign-in could not be completed. Please try again.");
  }

  let response = NextResponse.redirect(new URL("/choose-account-type", request.url));
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToAuth(request, requestedReturnTo, error.message);
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return redirectToAuth(request, requestedReturnTo, "OAuth sign-in succeeded but no session was returned.");
  }

  const [{ data: existingProfile }, { data: existingUser }] = await Promise.all([
    supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>()
  ]);

  const metadataRole = parseUserRole(user.user_metadata?.account_type || user.user_metadata?.role);
  const savedRole = parseUserRole(existingProfile?.account_type || existingUser?.role);
  const authCreatedAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const looksLikeBrandNewOAuthUser = Date.now() - authCreatedAt < 2 * 60 * 1000 && !metadataRole && !requestedRole;
  const accountRole = metadataRole || requestedRole || (looksLikeBrandNewOAuthUser ? null : savedRole);

  if (!accountRole) {
    const chooseUrl = new URL("/choose-account-type", request.url);
    if (requestedReturnTo) chooseUrl.searchParams.set("returnTo", requestedReturnTo);
    response = NextResponse.redirect(chooseUrl);
    return response;
  }

  await upsertRoleProfile(supabase, user, accountRole);
  response = NextResponse.redirect(new URL(safeDashboardRedirectForRole(requestedReturnTo, accountRole), request.url));
  return response;
}

function redirectToAuth(request: NextRequest, returnTo: string | null, error: string) {
  const authUrl = new URL("/auth", request.url);
  if (returnTo) authUrl.searchParams.set("returnTo", returnTo);
  authUrl.searchParams.set("error", error);
  return NextResponse.redirect(authUrl);
}

async function upsertRoleProfile(supabase: ReturnType<typeof createServerClient>, user: { id: string; email?: string | null; phone?: string | null; user_metadata?: Record<string, any> }, role: UserRole) {
  const now = new Date().toISOString();
  const fullName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "FastFleet user";

  await Promise.allSettled([
    supabase.auth.updateUser({ data: { account_type: role, role } }),
    supabase.from("users").upsert({
      id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      full_name: fullName,
      role,
      default_zone: "Lagos",
      updated_at: now
    }),
    supabase.from("profiles").upsert({
      id: user.id,
      user_id: user.id,
      email: user.email || null,
      phone: user.phone || null,
      full_name: fullName,
      account_type: role,
      updated_at: now
    })
  ]);
}
