import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { fastErrandAgeAcknowledgementCookieName, signFastErrandAgeAcknowledgement } from "@/lib/fast-errands-age-access";
import { loadFastErrandsCatalog } from "@/lib/fast-errands-catalog";

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

/** Records a session-only acknowledgement, never identity or proof of age. */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "fast-errands:age-access" });
  if (limited) return limited;
  const payload = await request.json().catch(() => ({})) as { categoryId?: unknown };
  const categoryId = String(payload.categoryId || "").trim();
  const category = (await loadFastErrandsCatalog(false, true)).find((entry) => entry.id === categoryId);
  if (!category?.access_minimum_age) return NextResponse.json({ error: "That restricted collection is not available." }, { status: 404 });
  const signed = signFastErrandAgeAcknowledgement(category.access_minimum_age);
  if (!signed) return NextResponse.json({ error: "Restricted FastErrand access is not configured." }, { status: 503 });
  // Return the authorised collection in this same response. It prevents a
  // browser timing race where a follow-up fetch could run before Set-Cookie is
  // committed, while still never exposing it before acknowledgement.
  const response = NextResponse.json({ acknowledgedMinimumAge: category.access_minimum_age, acknowledgement: "session_only_not_identity_verification", category });
  response.cookies.set(fastErrandAgeAcknowledgementCookieName, signed, cookieOptions);
  return response;
}

export async function DELETE(request: Request) {
  const limited = await enforceRateLimit(request, { ...rateLimitPolicies.estimate, name: "fast-errands:age-access-clear" });
  if (limited) return limited;
  const response = NextResponse.json({ ok: true });
  response.cookies.set(fastErrandAgeAcknowledgementCookieName, "", { ...cookieOptions, maxAge: 0 });
  return response;
}
