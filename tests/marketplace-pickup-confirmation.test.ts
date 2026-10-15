import assert from "node:assert/strict";
import test from "node:test";

process.env.DELIVERY_CONFIRMATION_SECRET = "local-test-pickup-confirmation-secret-at-least-thirty-two-characters";

const { MARKETPLACE_PICKUP_CODE_TTL_MS, issueMarketplacePickupCode, marketplacePickupCodeExpired, revealMarketplacePickupCode, verifyMarketplacePickupCode } = await import("../lib/marketplace-pickup-confirmation.ts");

test("marketplace pickup codes have a bounded expiry and remain customer-decryptable while pending", () => {
  const now = new Date("2026-10-15T00:00:00.000Z");
  const orderId = "00000000-0000-0000-0000-000000000001";
  const confirmation = issueMarketplacePickupCode(orderId, now);

  assert.equal(Date.parse(confirmation.expires_at), now.getTime() + MARKETPLACE_PICKUP_CODE_TTL_MS);
  assert.equal(marketplacePickupCodeExpired(confirmation, now.getTime()), false);
  assert.equal(marketplacePickupCodeExpired(confirmation, Date.parse(confirmation.expires_at)), true);
  const pending = { order_id: orderId, ...confirmation, status: "pending" as const, attempts: 0 };
  const code = revealMarketplacePickupCode(pending) || "";
  assert.match(code, /^\d{6}$/);
  assert.equal(verifyMarketplacePickupCode(code, orderId, confirmation.code_digest), true);
});

test("checkout persists only protected pickup confirmation fields", async () => {
  const source = await import("node:fs").then(({ readFileSync }) => readFileSync("app/api/marketplace/checkout/route.ts", "utf8"));
  assert.match(source, /const \{ code: _pickupCode, \.\.\.confirmation \} = issueMarketplacePickupCode/);
  assert.match(source, /insert\(\{ order_id: order\.id, \.\.\.confirmation \}\)/);
  assert.doesNotMatch(source, /insert\(\{ order_id: order\.id, \.\.\.issueMarketplacePickupCode/);
});
