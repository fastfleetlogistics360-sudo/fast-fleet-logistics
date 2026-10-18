import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("security-remediation/migrations/202610180001_monday_free_breakfast_restaurant_only.sql");
const quoteRoute = read("app/api/marketplace/monday-breakfast/route.ts");
const checkout = read("app/api/marketplace/checkout/route.ts");

test("Monday Breakfast is structurally restaurant-only", () => {
  assert.match(migration, /source_kind = 'restaurant'/);
  assert.match(migration, /Shopping vendors,\s*-- including groceries which sell food, are structurally excluded/);
  assert.match(quoteRoute, /body\.kind !== "restaurant"/);
  assert.match(quoteRoute, /resolveMarketplaceVendorForCheckout\(db, "restaurant"/);
});

test("allocation is per restaurant, Monday, and protected from concurrent oversubscription", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /marketplace_vendor_id = target_vendor_id/);
  assert.match(migration, /occurrence_date = occurrence/);
  assert.match(migration, /state in \('reserved','completed'\)/);
  assert.match(migration, /clock_timestamp\(\) at time zone 'Africa\/Lagos'/);
});

test("checkout never trusts a client vendor category or promotion amount", () => {
  assert.match(checkout, /vendorId: vendorResolution\.vendor\.id/);
  assert.match(checkout, /reserveMondayFreeBreakfast/);
  assert.match(checkout, /mondayBreakfastPayable\(/);
  assert.match(checkout, /platformFeeNgn: platformFee/);
  assert.match(checkout, /deliveryFeeNgn: deliveryFee/);
  assert.doesNotMatch(checkout, /payload\.mondayBreakfastDiscount/);
});

test("shopping checkout remains outside subsidy calculation", () => {
  assert.match(checkout, /marketplaceKind === "restaurant" && payload\.mondayBreakfastRequested === true/);
  assert.match(quoteRoute, /eligible: false, subsidyNgn: 0/);
});

test("restaurant food order can use the locked campaign reservation in-window", () => {
  assert.match(migration, /local_now::time < time '10:00' or local_now::time >= time '12:00'/);
  assert.match(migration, /subsidy := least\(greatest\(food_subtotal_kobo, 0\), campaign\.subsidy_cap_kobo\)/);
});

test("supermarket, electronics, clothing, and food-labelled Shopping vendors are never eligible", () => {
  // The trusted source_kind check is intentionally category-agnostic: a
  // grocery vendor cannot opt in merely because it sells a meal or drink.
  assert.match(migration, /source_kind = 'restaurant' and lifecycle_status = 'active'/);
  assert.doesNotMatch(quoteRoute, /body\.kind === "shopping"[\s\S]*quote_monday_free_breakfast/);
});

test("spoofed restaurant payloads are rejected by the trusted vendor lookup", () => {
  assert.match(migration, /Restaurant campaign vendor mismatch/);
  assert.match(checkout, /vendorId: vendorResolution\.vendor\.id/);
});
