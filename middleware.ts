import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { UserRole } from "@/types/domain";

const PROTECTED_PREFIXES = ["/dashboard", "/book", "/rider/dashboard", "/business/dashboard"];

const ROLE_PREFIXES: Array<{ prefix: string; roles: UserRole[] }> = [
  { prefix: "/rider/dashboard", roles: ["rider", "admin"] },
  { prefix: "/business/dashboard", roles: ["business", "admin"] }
];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request
  });
  const pathname = request.nextUrl.pathname;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: Parameters<typeof response.cookies.set>[2] }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const protectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (protectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth";
    redirectUrl.searchParams.set("returnTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  const roleRule = ROLE_PREFIXES.find((rule) => pathname.startsWith(rule.prefix));
  if (roleRule && user) {
    const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).maybeSingle();
    const role = (profile?.role || user.user_metadata?.role || user.user_metadata?.account_type || "customer") as UserRole;
    if (!roleRule.roles.includes(role)) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/dashboard";
      redirectUrl.searchParams.set("access", "restricted");
      return NextResponse.redirect(redirectUrl);
    }
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fastfleet-logo.png|hero/|manifest.webmanifest|sw.js).*)"]
};
