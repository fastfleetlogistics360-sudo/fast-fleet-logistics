import { SUPPORT_TURNSTILE_ACTION } from "@/lib/support/policy";

const TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

type TurnstileResponse = {
  success?: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

export type SupportTurnstileResult =
  | { ok: true }
  | { ok: false; code: "TURNSTILE_REQUIRED" | "TURNSTILE_INVALID" | "TURNSTILE_UNAVAILABLE" };

type VerifySupportTurnstileInput = {
  token: string;
  remoteIp?: string | null;
  idempotencyKey: string;
  expectedHostname: string;
  secret?: string;
  fetcher?: (input: string, init: RequestInit) => Promise<Response>;
};

export async function verifySupportTurnstile(input: VerifySupportTurnstileInput): Promise<SupportTurnstileResult> {
  const secret = input.secret ?? process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return { ok: false, code: "TURNSTILE_UNAVAILABLE" };
  if (!input.token || input.token.length > 2_048) return { ok: false, code: "TURNSTILE_REQUIRED" };

  const payload = new FormData();
  payload.set("secret", secret);
  payload.set("response", input.token);
  payload.set("idempotency_key", input.idempotencyKey);
  if (input.remoteIp && input.remoteIp !== "unknown-ip") payload.set("remoteip", input.remoteIp);

  try {
    const fetcher = input.fetcher || fetch;
    const response = await fetcher(TURNSTILE_SITEVERIFY_URL, {
      method: "POST",
      body: payload,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000)
    });
    if (!response.ok) return { ok: false, code: "TURNSTILE_UNAVAILABLE" };

    const result = (await response.json().catch(() => null)) as TurnstileResponse | null;
    if (!result?.success || result.action !== SUPPORT_TURNSTILE_ACTION) {
      return { ok: false, code: "TURNSTILE_INVALID" };
    }
    const expectedHostname = input.expectedHostname.toLowerCase();
    if (!isLocalTurnstileHostname(expectedHostname) && result.hostname?.toLowerCase() !== expectedHostname) {
      return { ok: false, code: "TURNSTILE_INVALID" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "TURNSTILE_UNAVAILABLE" };
  }
}

function isLocalTurnstileHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}
