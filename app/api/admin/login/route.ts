import { NextResponse } from "next/server";
import { ADMIN_SESSION_COOKIE, adminSessionToken, verifyAdminCredentials } from "@/lib/admin-auth";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.adminLogin);
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "");
  const password = String(body.password || "");

  if (!verifyAdminCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid admin username or password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: adminSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12
  });

  return response;
}
