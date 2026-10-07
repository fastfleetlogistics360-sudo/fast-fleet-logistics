import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseReferralIntent, REFERRAL_COOKIE } from "@/lib/referrals";

export async function GET(request: NextRequest) {
  const requestedReturnTo = request.nextUrl.searchParams.get("returnTo");
  const safeReturnTo = requestedReturnTo && requestedReturnTo.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/hub";
  const destination = new URL(safeReturnTo, request.url);
  const intent = parseReferralIntent(request.cookies.get(REFERRAL_COOKIE)?.value);
  if (!intent) return NextResponse.redirect(destination);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    const auth = new URL("/auth", request.url);
    auth.searchParams.set("returnTo", `/referrals/claim?returnTo=${encodeURIComponent(safeReturnTo)}`);
    return NextResponse.redirect(auth);
  }
  const { error } = await supabase.rpc("claim_referral_attribution", { target_intent_id: intent.intentId });
  const response = NextResponse.redirect(error ? new URL(`/hub?referral=${encodeURIComponent(error.message)}`, request.url) : destination);
  // Invalid, self, and already-attributed links must not be retried forever.
  response.cookies.set(REFERRAL_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
