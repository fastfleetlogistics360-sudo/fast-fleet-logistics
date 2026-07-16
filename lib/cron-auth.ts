import { createHash, timingSafeEqual } from "crypto";

export const MIN_CRON_SECRET_LENGTH = 32;

type CronEnvironment = Partial<Record<"CRON_SECRET", string>>;

export type CronAuthorizationResult =
  | { authorized: true }
  | { authorized: false; reason: "misconfigured" | "unauthorized" };

export function authorizeCronRequest(
  request: Request,
  environment: CronEnvironment = process.env as CronEnvironment
): CronAuthorizationResult {
  const secret = environment.CRON_SECRET?.trim();
  if (!secret || secret.length < MIN_CRON_SECRET_LENGTH) {
    return { authorized: false, reason: "misconfigured" };
  }

  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match || !safeEqual(match[1], secret)) {
    return { authorized: false, reason: "unauthorized" };
  }

  return { authorized: true };
}

function safeEqual(received: string, expected: string) {
  const receivedDigest = createHash("sha256").update(received).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}
