import { createHash, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "fastfleet_admin_session";

const ADMIN_USERNAME = process.env.FASTFLEET_ADMIN_USERNAME || "FastFleetAdmin";
const ADMIN_PASSWORD = process.env.FASTFLEET_ADMIN_PASSWORD || "Fastfleet360@#";
const ADMIN_SECRET = process.env.FASTFLEET_ADMIN_SECRET || `${ADMIN_USERNAME}:${ADMIN_PASSWORD}:fastfleet-admin`;

export function adminSessionToken() {
  return createHash("sha256").update(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}:${ADMIN_SECRET}`).digest("hex");
}

export function isValidAdminSession(value?: string | null) {
  if (!value) return false;
  const expected = Buffer.from(adminSessionToken());
  const received = Buffer.from(value);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export function verifyAdminCredentials(username: string, password: string) {
  const expectedUsername = Buffer.from(ADMIN_USERNAME);
  const expectedPassword = Buffer.from(ADMIN_PASSWORD);
  const receivedUsername = Buffer.from(username);
  const receivedPassword = Buffer.from(password);

  return (
    expectedUsername.length === receivedUsername.length &&
    expectedPassword.length === receivedPassword.length &&
    timingSafeEqual(expectedUsername, receivedUsername) &&
    timingSafeEqual(expectedPassword, receivedPassword)
  );
}
