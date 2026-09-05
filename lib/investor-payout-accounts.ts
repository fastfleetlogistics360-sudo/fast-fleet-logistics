import { createCipheriv, randomBytes } from "crypto";

const VERSION = "v1";

export function encryptInvestorAccountNumber(accountNumber: string) {
  const key = payoutEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(accountNumber, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function maskAccountNumber(last4: string | null | undefined) {
  return last4 ? `••••••${last4}` : "Not added";
}

function payoutEncryptionKey() {
  const raw = process.env.INVESTOR_PAYOUT_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("Investor payout setup is temporarily unavailable.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("Investor payout setup is temporarily unavailable.");
  return key;
}
