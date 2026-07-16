import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  AdminAuthConfigurationError,
  createAdminSession,
  getAdminAuthConfig,
  isSameOriginAdminMutation,
  verifyAdminCredentials
} from "@/lib/admin-auth";
import { hasCurrentSupabaseAdminAuthority } from "@/app/api/admin/_auth";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOriginAdminMutation(request)) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }

  const limited = await enforceRateLimit(request, rateLimitPolicies.adminLogin);
  if (limited) return limited;

  try {
    const config = getAdminAuthConfig();
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    if (
      username.length > 256 ||
      password.length > 4096 ||
      !verifyAdminCredentials(username, password, config) ||
      !(await hasCurrentSupabaseAdminAuthority(config.userId))
    ) {
      return NextResponse.json({ error: "Invalid admin credentials." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: ADMIN_SESSION_COOKIE,
      value: createAdminSession(Date.now(), config),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: ADMIN_SESSION_MAX_AGE_SECONDS
    });

    return response;
  } catch (error) {
    if (error instanceof AdminAuthConfigurationError) {
      console.error(`[admin-auth] ${error.message}`);
    } else {
      console.error("[admin-auth] Admin login failed because authorization could not be verified.");
    }
    return NextResponse.json({ error: "Admin access is temporarily unavailable." }, { status: 503 });
  }
}
