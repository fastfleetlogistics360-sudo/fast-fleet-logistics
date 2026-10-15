import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accountOrder = readFileSync("app/account/orders/[orderId]/_components/account-order-page.tsx", "utf8");
const pickupStatus = readFileSync("components/marketplace/pickup-order-status.tsx", "utf8");

test("F062: Pickup status is driven by server payment_status, not a hard-coded confirmation", () => {
  assert.match(accountOrder, /paymentStatus=\{marketplaceOrder\.payment_status \|\| "pending"\}/);
  assert.match(pickupStatus, /const paid = paymentStatus === "paid";/);
  assert.match(pickupStatus, /Payment Pending/);
  assert.match(pickupStatus, /if \(!paid\) return;/);
  assert.match(pickupStatus, /no pickup code is available until Squad verifies payment/);
});
