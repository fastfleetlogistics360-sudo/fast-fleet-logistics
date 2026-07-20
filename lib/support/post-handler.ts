import { SupportPersistenceError, type AtomicSupportTicketInput } from "@/lib/support/atomic-ticket";
import {
  SUPPORT_BODY_MAX_LENGTH,
  cleanSupportText,
  isSupportIdempotencyKey,
  normalizeSupportSource,
  normalizeSupportTopic,
  supportTopics
} from "@/lib/support/policy";
import type { SupportTurnstileResult } from "@/lib/support/turnstile";

type SupportRequest = {
  source?: unknown;
  topic?: unknown;
  body?: unknown;
  trackingCode?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  idempotencyKey?: unknown;
  turnstileToken?: unknown;
};

type SupportUser = {
  id: string;
  email?: string | null;
  phone?: string | null;
  user_metadata?: { full_name?: unknown } | null;
};

type SupportProfile = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type SupportPostDependencies = {
  getUser: () => Promise<SupportUser | null>;
  getProfile: (userId: string) => Promise<SupportProfile | null>;
  trustedClientIp: (request: Request) => string;
  enforceRateLimits: (request: Request, source: "form" | "widget", trustedIp: string) => Promise<Response | null>;
  verifyTurnstile: (input: {
    token: string;
    remoteIp: string;
    idempotencyKey: string;
    expectedHostname: string;
  }) => Promise<SupportTurnstileResult>;
  createTicket: (input: AtomicSupportTicketInput) => Promise<{ ticketId: string; created: boolean }>;
  reportUnexpectedPersistenceError?: (error: unknown) => void;
};

export function createSupportPostHandler(dependencies: SupportPostDependencies) {
  return async function supportPost(request: Request) {
    const body = (await request.json().catch(() => null)) as SupportRequest | null;
    const source = normalizeSupportSource(body?.source);
    const topic = normalizeSupportTopic(body?.topic);
    if (!source || !topic) return response({ error: "Choose a valid support topic.", code: "SUPPORT_REQUEST_INVALID" }, 400);

    const idempotencyKey = body?.idempotencyKey;
    if (!isSupportIdempotencyKey(idempotencyKey)) {
      return response({ error: "Refresh the page and try again.", code: "SUPPORT_REQUEST_INVALID" }, 400);
    }
    if (typeof body?.body !== "string" || body.body.trim().length > SUPPORT_BODY_MAX_LENGTH) {
      return response({ error: "Support messages must be 2,000 characters or fewer.", code: "SUPPORT_MESSAGE_INVALID" }, 400);
    }

    const message = cleanSupportText(body.body, SUPPORT_BODY_MAX_LENGTH);
    if (message.length < 6) return response({ error: "Add a short message so support knows what to solve.", code: "SUPPORT_MESSAGE_INVALID" }, 400);

    const user = await dependencies.getUser();
    const trustedIp = dependencies.trustedClientIp(request);
    const limited = await dependencies.enforceRateLimits(request, source, trustedIp);
    if (limited) return limited;

    if (!user) {
      const turnstile = await dependencies.verifyTurnstile({
        token: cleanSupportText(body.turnstileToken, 2_048),
        remoteIp: trustedIp,
        idempotencyKey,
        expectedHostname: new URL(request.url).hostname
      });
      if (!turnstile.ok) {
        const unavailable = turnstile.code === "TURNSTILE_UNAVAILABLE";
        return response(
          {
            error: unavailable ? "Anonymous support verification is temporarily unavailable." : "Complete the support verification and try again.",
            code: turnstile.code
          },
          unavailable ? 503 : 403
        );
      }
    }

    let profile: SupportProfile | null = null;
    if (user) {
      try {
        profile = await dependencies.getProfile(user.id);
      } catch {
        // Auth identity remains the safe fallback when the optional profile read
        // is unavailable; request-supplied contact fields are still ignored.
      }
    }

    const policy = supportTopics[topic];
    const trackingCode = cleanSupportText(body.trackingCode, 80);
    const contactName = user
      ? cleanSupportText(profile?.full_name, 120) || cleanSupportText(user.user_metadata?.full_name, 120) || null
      : cleanSupportText(body.name, 120) || null;
    const contactEmail = user
      ? cleanSupportText(profile?.email, 180) || cleanSupportText(user.email, 180) || null
      : cleanSupportText(body.email, 180) || null;
    const contactPhone = user
      ? cleanSupportText(profile?.phone, 40) || cleanSupportText(user.phone, 40) || null
      : cleanSupportText(body.phone, 40) || null;
    const ticketMessage = `${message}${trackingCode ? `\nTracking code: ${trackingCode}` : ""}`;

    try {
      const ticket = await dependencies.createTicket({
        idempotencyKey,
        userId: user?.id || null,
        contactName,
        contactEmail,
        contactPhone,
        topic,
        subject: policy.subject,
        ticketMessage,
        priority: policy.priority,
        customerMessage: source === "widget" ? message : null,
        botMessage: source === "widget" ? policy.automatedReply : null
      });
      return response(user ? { ticketId: ticket.ticketId, created: ticket.created } : { created: ticket.created }, ticket.created ? 201 : 200);
    } catch (error) {
      if (!(error instanceof SupportPersistenceError)) dependencies.reportUnexpectedPersistenceError?.(error);
      return response({ error: "We could not send your request. Please try again.", code: "SUPPORT_CREATE_FAILED" }, 503);
    }
  };
}

function response(body: Record<string, unknown>, status: number) {
  const result = Response.json(body, { status });
  result.headers.set("Cache-Control", "no-store");
  return result;
}
