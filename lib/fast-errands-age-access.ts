import { createHmac, timingSafeEqual } from "node:crypto";

export const fastErrandAgeAcknowledgementCookieName = "fastfleet_fasterrands_age_ack";
const acknowledgementVersion = 1;

type AgeAcknowledgement = { version: number; minimumAge: number; issuedAt: number };

export function normaliseFastErrandMinimumAge(value: unknown) {
  const age = Math.round(Number(value));
  return Number.isInteger(age) && age >= 18 && age <= 100 ? age : null;
}

export function effectiveFastErrandMinimumAge(...values: unknown[]) {
  const ages = values.map(normaliseFastErrandMinimumAge).filter((value): value is number => value !== null);
  return ages.length ? Math.max(...ages) : null;
}

export function hasFastErrandAgeAccess(acknowledgedMinimumAge: unknown, requiredMinimumAge: unknown) {
  const acknowledged = normaliseFastErrandMinimumAge(acknowledgedMinimumAge);
  const required = normaliseFastErrandMinimumAge(requiredMinimumAge);
  return !required || (acknowledged !== null && acknowledged >= required);
}

export function signFastErrandAgeAcknowledgement(minimumAge: unknown) {
  const age = normaliseFastErrandMinimumAge(minimumAge);
  if (!age) return null;
  const secret = acknowledgementSecret();
  if (!secret) return null;
  const payload: AgeAcknowledgement = { version: acknowledgementVersion, minimumAge: age, issuedAt: Date.now() };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createHmac("sha256", secret).update(encoded).digest("base64url")}`;
}

export function readFastErrandAgeAcknowledgement(value: string | undefined | null) {
  const secret = acknowledgementSecret();
  if (!secret || !value) return null;
  const [encoded, signature, ...extra] = value.split(".");
  if (!encoded || !signature || extra.length) return null;
  const expected = createHmac("sha256", secret).update(encoded).digest("base64url");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<AgeAcknowledgement>;
    if (parsed.version !== acknowledgementVersion || !normaliseFastErrandMinimumAge(parsed.minimumAge) || !Number.isFinite(parsed.issuedAt)) return null;
    return normaliseFastErrandMinimumAge(parsed.minimumAge);
  } catch { return null; }
}

export function readFastErrandAgeAcknowledgementFromCookieHeader(header: string | null) {
  const cookie = header?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${fastErrandAgeAcknowledgementCookieName}=`));
  return readFastErrandAgeAcknowledgement(cookie?.slice(fastErrandAgeAcknowledgementCookieName.length + 1));
}

function acknowledgementSecret() {
  const configured = process.env.FASTERRAND_AGE_ACK_SECRET?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (configured && configured.length >= 32) return configured;
  // FastErrand uses its dedicated secret when configured. The service-role
  // fallback keeps the signed acknowledgement durable in existing production
  // deployments, where that server-only secret is already mandatory.
  return process.env.NODE_ENV === "production" ? null : "fast-errand-local-development-acknowledgement-secret";
}
