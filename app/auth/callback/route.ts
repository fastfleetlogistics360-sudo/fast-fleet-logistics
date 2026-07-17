import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { parseSelfServiceRole, parseUserRole, safeDashboardRedirectForRole } from "@/lib/auth/roles";
import { upsertRoleProfile } from "@/lib/auth/profile-completion";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedReturnTo = requestUrl.searchParams.get("returnTo");
  const requestedRole = parseSelfServiceRole(requestUrl.searchParams.get("role"));
  const providerError = requestUrl.searchParams.get("error_description") || requestUrl.searchParams.get("error");

  if (providerError) {
    return redirectToAuth(request, requestedReturnTo, friendlyAuthError(providerError));
  }

  const { url, anonKey } = getSupabasePublicConfig();
  if (!code || !url || !anonKey) {
    return redirectToAuth(request, requestedReturnTo, "OAuth sign-in could not be completed. Please try again.");
  }

  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(nextCookies: CookieToSet[]) {
        nextCookies.forEach(({ name, value }) => request.cookies.set(name, value));
        cookiesToSet.push(...nextCookies);
      }
    }
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToAuth(request, requestedReturnTo, friendlyAuthError(error.message));
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

  const metadataRole = parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
  const savedRole = parseUserRole(existingProfile?.account_type || existingUser?.role);
  const authCreatedAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const looksLikeBrandNewOAuthUser = Date.now() - authCreatedAt < 2 * 60 * 1000 && !metadataRole && !requestedRole;
  const accountRole = savedRole === "admin" ? savedRole : metadataRole || requestedRole || (looksLikeBrandNewOAuthUser ? null : savedRole);

  if (!accountRole) {
    const chooseUrl = new URL("/choose-account-type", request.url);
    if (requestedReturnTo) chooseUrl.searchParams.set("returnTo", requestedReturnTo);
    return redirectWithCookies(chooseUrl, cookiesToSet);
  }

  if (accountRole !== "admin") {
    await upsertRoleProfile(supabase, user, accountRole);
  }
  return redirectWithCookies(new URL(safeDashboardRedirectForRole(requestedReturnTo || "/hub", accountRole), request.url), cookiesToSet);
}

function redirectToAuth(request: NextRequest, returnTo: string | null, error: string) {
  const authUrl = new URL("/auth", request.url);
  if (returnTo) authUrl.searchParams.set("returnTo", returnTo);
  authUrl.searchParams.set("error", error);
  return NextResponse.redirect(authUrl);
}

function redirectWithCookies(url: URL, cookiesToSet: CookieToSet[]) {
  const response = NextResponse.redirect(url);
  cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("external code")) {
    return "Google sign-in could not be completed. Please try again or contact support if the problem continues.";
  }
  if (normalized.includes("code verifier") || normalized.includes("pkce")) {
    return "This verification link opened in a different browser session. Please request a new verification email, or open the link in the same browser you used to register.";
  }
  return message;
}
