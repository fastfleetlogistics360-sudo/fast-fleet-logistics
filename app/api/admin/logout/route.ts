import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, isSameOriginAdminMutation } from "@/lib/admin-auth";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  if (!isSameOriginAdminMutation(request)) {
    return NextResponse.json({ error: "Request rejected." }, { status: 403 });
  }
  const limited = await enforceRateLimit(request, rateLimitPolicies.authSensitive);
  if (limited) return limited;

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
