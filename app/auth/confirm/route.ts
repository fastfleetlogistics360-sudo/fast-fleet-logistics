import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
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
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = (requestUrl.searchParams.get("type") || "signup") as EmailOtpType;
  const redirectHints = parseRedirectHints(request);

  if (!tokenHash) {
    return redirectToAuth(request, redirectHints.returnTo, "Email verification link is missing its secure token. Please request a new verification email.");
  }

  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    return redirectToAuth(request, redirectHints.returnTo, "Email verification is temporarily unavailable. Please try again.");
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

  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) {
    return redirectToAuth(request, redirectHints.returnTo, friendlyAuthError(error.message));
  }

  const user = data.user || data.session?.user;
  if (!user) {
    return redirectToAuth(request, redirectHints.returnTo, "Email verified, but no session was returned. Please sign in.");
  }

  const [{ data: existingProfile }, { data: existingUser }] = await Promise.all([
    supabase.from("profiles").select("account_type").eq("user_id", user.id).maybeSingle<{ account_type?: string | null }>(),
    supabase.from("users").select("role").eq("id", user.id).maybeSingle<{ role?: string | null }>()
  ]);

  const metadataRole = parseSelfServiceRole(user.user_metadata?.account_type || user.user_metadata?.role);
  const savedRole = parseUserRole(existingProfile?.account_type || existingUser?.role);
  const authCreatedAt = user.created_at ? new Date(user.created_at).getTime() : Date.now();
  const looksLikeBrandNewEmailUser = Date.now() - authCreatedAt < 2 * 60 * 1000 && !metadataRole && !redirectHints.role;
  const accountRole = savedRole === "admin" ? savedRole : metadataRole || redirectHints.role || (looksLikeBrandNewEmailUser ? null : savedRole);
  if (!accountRole) {
    const chooseUrl = new URL("/choose-account-type", request.url);
    if (redirectHints.returnTo) chooseUrl.searchParams.set("returnTo", redirectHints.returnTo);
    return redirectWithCookies(chooseUrl, cookiesToSet);
  }

  if (accountRole !== "admin") {
    await upsertRoleProfile(supabase, user, accountRole);
  }
  return redirectWithCookies(new URL(safeDashboardRedirectForRole(redirectHints.returnTo || "/hub", accountRole), request.url), cookiesToSet);
}

function parseRedirectHints(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const rawRedirectTo = requestUrl.searchParams.get("redirect_to") || requestUrl.searchParams.get("next");
  let returnTo = requestUrl.searchParams.get("returnTo");
  let role = parseSelfServiceRole(requestUrl.searchParams.get("role") || requestUrl.searchParams.get("account"));

  if (rawRedirectTo) {
    try {
      const redirectUrl = new URL(rawRedirectTo, request.url);
      if (redirectUrl.origin === requestUrl.origin) {
        returnTo ||= redirectUrl.searchParams.get("returnTo") || (redirectUrl.pathname === "/auth/callback" ? null : `${redirectUrl.pathname}${redirectUrl.search}`);
        role ||= parseSelfServiceRole(redirectUrl.searchParams.get("role") || redirectUrl.searchParams.get("account"));
      }
    } catch {
      // Ignore malformed redirect hints and fall back to the explicit params.
    }
  }

  return {
    returnTo: returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : null,
    role
  };
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
  if (message.toLowerCase().includes("expired")) return "This verification link has expired. Please request a new one.";
  if (message.toLowerCase().includes("invalid")) return "This verification link is invalid or has already been used. Please sign in or request a new link.";
  return message || "Email verification could not be completed. Please try again.";
}
