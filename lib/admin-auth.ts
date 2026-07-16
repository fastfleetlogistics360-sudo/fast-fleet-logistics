import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "fastfleet_admin_session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;
export const MIN_ADMIN_SECRET_LENGTH = 32;

type AdminAuthEnvironment = Partial<
  Record<"FASTFLEET_ADMIN_USERNAME" | "FASTFLEET_ADMIN_PASSWORD" | "FASTFLEET_ADMIN_SECRET" | "FASTFLEET_ADMIN_USER_ID", string>
>;

export type AdminAuthConfig = {
  username: string;
  password: string;
  secret: string;
  userId: string;
};

export type AdminSessionPayload = {
  version: 1;
  issuedAt: number;
  expiresAt: number;
  userId: string;
};

export type SupabaseAdminAuthorityState = {
  authUser: { id: string; bannedUntil?: string | null; deletedAt?: string | null } | null;
  profile: { userId?: string | null; isAdmin?: boolean | null; deletedAt?: string | null } | null;
  failed: boolean;
};

export class AdminAuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminAuthConfigurationError";
  }
}

export function getAdminAuthConfig(environment: AdminAuthEnvironment = process.env as AdminAuthEnvironment): AdminAuthConfig {
  const username = requiredValue(environment.FASTFLEET_ADMIN_USERNAME, "FASTFLEET_ADMIN_USERNAME");
  const password = requiredValue(environment.FASTFLEET_ADMIN_PASSWORD, "FASTFLEET_ADMIN_PASSWORD");
  const secret = requiredValue(environment.FASTFLEET_ADMIN_SECRET, "FASTFLEET_ADMIN_SECRET");
  const userId = requiredValue(environment.FASTFLEET_ADMIN_USER_ID, "FASTFLEET_ADMIN_USER_ID");

  if (secret.length < MIN_ADMIN_SECRET_LENGTH) {
    throw new AdminAuthConfigurationError(`FASTFLEET_ADMIN_SECRET must be at least ${MIN_ADMIN_SECRET_LENGTH} characters.`);
  }
  if (!isUuid(userId)) {
    throw new AdminAuthConfigurationError("FASTFLEET_ADMIN_USER_ID must be a valid Supabase user UUID.");
  }

  return { username, password, secret, userId };
}

export function createAdminSession(now = Date.now(), config = getAdminAuthConfig()): string {
  const issuedAt = Math.floor(now / 1000);
  const payload: AdminSessionPayload = {
    version: 1,
    issuedAt,
    expiresAt: issuedAt + ADMIN_SESSION_MAX_AGE_SECONDS,
    userId: config.userId
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, config.secret)}`;
}

export function verifyAdminSession(value?: string | null, now = Date.now(), config = getAdminAuthConfig()): AdminSessionPayload | null {
  if (!value) return null;
  const [encodedPayload, receivedSignature, extra] = value.split(".");
  if (!encodedPayload || !receivedSignature || extra) return null;

  const expectedSignature = sign(encodedPayload, config.secret);
  if (!safeEqual(expectedSignature, receivedSignature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<AdminSessionPayload>;
    const currentTime = Math.floor(now / 1000);
    if (
      payload.version !== 1 ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      payload.userId !== config.userId ||
      Number(payload.issuedAt) > currentTime + 60 ||
      Number(payload.expiresAt) <= currentTime ||
      Number(payload.expiresAt) - Number(payload.issuedAt) !== ADMIN_SESSION_MAX_AGE_SECONDS
    ) {
      return null;
    }
    return payload as AdminSessionPayload;
  } catch {
    return null;
  }
}

export function verifyAdminCredentials(username: string, password: string, config = getAdminAuthConfig()) {
  return safeCredentialEqual(username, config.username, config.secret) && safeCredentialEqual(password, config.password, config.secret);
}

export function isSameOriginAdminMutation(request: Request) {
  if (new Set(["GET", "HEAD", "OPTIONS"]).has(request.method.toUpperCase())) return true;

  const expectedOrigins = new Set<string>();
  try {
    expectedOrigins.add(new URL(request.url).origin);
  } catch {
    return false;
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configuredSiteUrl) {
    try {
      expectedOrigins.add(new URL(configuredSiteUrl).origin);
    } catch {
      // The request origin remains authoritative if the optional site URL is malformed.
    }
  }

  const origin = request.headers.get("origin");
  if (origin) return normalizedOriginIsAllowed(origin, expectedOrigins);

  const referer = request.headers.get("referer");
  if (!referer) return false;
  return normalizedOriginIsAllowed(referer, expectedOrigins);
}

export function isAuthorizedAdminState(userId: string, state: SupabaseAdminAuthorityState, now = Date.now()) {
  const { authUser, profile, failed } = state;
  if (failed || !authUser || authUser.id !== userId || authUser.deletedAt || profile?.deletedAt || !profile?.isAdmin) return false;
  if (authUser.bannedUntil && new Date(authUser.bannedUntil).getTime() > now) return false;
  return profile.userId === userId;
}

function requiredValue(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) throw new AdminAuthConfigurationError(`${name} is required.`);
  return normalized;
}

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeCredentialEqual(received: string, expected: string, secret: string) {
  const receivedDigest = createHmac("sha256", secret).update(received).digest();
  const expectedDigest = createHmac("sha256", secret).update(expected).digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}

function safeEqual(expected: string, received: string) {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length === receivedBuffer.length && timingSafeEqual(expectedBuffer, receivedBuffer);
}

function normalizedOriginIsAllowed(value: string, expectedOrigins: Set<string>) {
  try {
    return expectedOrigins.has(new URL(value).origin);
  } catch {
    return false;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
