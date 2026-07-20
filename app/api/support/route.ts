import { NextResponse } from "next/server";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { createSupportTicketAtomic } from "@/lib/support/atomic-ticket";
import { supportClientIp } from "@/lib/support/client-ip";
import { createSupportPostHandler } from "@/lib/support/post-handler";
import { verifySupportTurnstile } from "@/lib/support/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupportProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const db = createAdminClient();
  if (!db) return response({ error: "Support is temporarily unavailable. Please try again.", code: "SUPPORT_UNAVAILABLE" }, 503);

  return createSupportPostHandler({
    getUser: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
    getProfile: async (userId) => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email, phone")
        .eq("user_id", userId)
        .maybeSingle<SupportProfile>();
      return data;
    },
    trustedClientIp: supportClientIp,
    enforceRateLimits: async (nextRequest, source, trustedIp) => {
      const context = { trustedAnonymousIp: trustedIp };
      const ticketLimit = await enforceRateLimit(nextRequest, rateLimitPolicies.supportTicketCreate, context);
      if (ticketLimit || source !== "widget") return ticketLimit;
      return enforceRateLimit(nextRequest, rateLimitPolicies.supportMessageCreate, context);
    },
    verifyTurnstile: verifySupportTurnstile,
    createTicket: (input) => createSupportTicketAtomic(db, input),
    reportUnexpectedPersistenceError: () => console.error("support_ticket_creation_failed")
  })(request);
}

function response(body: Record<string, unknown>, status: number) {
  const result = NextResponse.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
