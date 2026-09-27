import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../..", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("F022: FastErrand restricted catalogue content is server-gated", async () => {
  const [migration, catalog, accessRoute, categoryRoute, checkout, quote, customer, admin] = await Promise.all([
    read("supabase-fast-errands-adult-essentials-delta.sql"), read("lib/fast-errands-catalog.ts"), read("app/api/fast-errands/access/route.ts"), read("app/api/fast-errands/categories/[categoryId]/route.ts"), read("app/api/fast-errands/checkout/route.ts"), read("app/api/fast-errands/quote/route.ts"), read("components/fast-errands/fast-errand-checkout.tsx"), read("components/admin/fast-errands-admin-queue.tsx")
  ]);
  assert.match(migration, /minimum_age integer/);
  assert.match(migration, /Adult Essentials/);
  assert.match(migration, /Condoms/);
  assert.doesNotMatch(migration, /stock_quantity|stock decrement|inventory/i);
  assert.match(catalog, /includeRestrictedItems = false/);
  assert.match(catalog, /includeRestrictedItems \|\| !access_minimum_age/);
  assert.match(accessRoute, /session_only_not_identity_verification/);
  assert.match(categoryRoute, /hasFastErrandAgeAccess/);
  assert.match(categoryRoute, /status: 403/);
  assert.match(quote, /acknowledgedMinimumAge/);
  assert.match(checkout, /age_restriction/);
  assert.match(customer, /Don't rush 😅\. Your time will come\./);
  assert.match(customer, /\/api\/fast-errands\/categories/);
  assert.match(customer, /role="dialog"/);
  assert.match(admin, /\+ Add New Item/);
});
