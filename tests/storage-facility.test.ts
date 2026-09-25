import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("storage durations use the agreed daily, weekly and monthly multipliers", () => {
  const resolver = readFileSync(new URL("../lib/storage-facility.ts", import.meta.url), "utf8");
  assert.match(resolver, /day_1: \{ label: "1 Day", days: 1, rate: "daily", units: 1 \}/);
  assert.match(resolver, /day_3: \{ label: "3 Days", days: 3, rate: "daily", units: 3 \}/);
  assert.match(resolver, /week_2: \{ label: "2 Weeks", days: 14, rate: "weekly", units: 2 \}/);
  assert.match(resolver, /month_1: \{ label: "1 Month", days: 30, rate: "monthly", units: 1 \}/);
});

test("storage checkout rebuilds server quote and requires hazardous-item acknowledgement", () => {
  const checkout = readFileSync(new URL("../app/api/storage-facility/checkout/route.ts", import.meta.url), "utf8");
  assert.match(checkout, /resolveStorageQuote/);
  assert.match(checkout, /prohibitedAcknowledged !== true/);
  assert.match(checkout, /quoteFingerprint/);
  assert.doesNotMatch(checkout, /body\.total/);
});
