import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("restaurant catalogue loads the registered customer state and sorts local, open vendors first", () => {
  const page = read("app/restaurants/page.tsx");
  const catalogue = read("components/marketplace/order-marketplace.tsx");
  assert.match(page, /loadMarketplaceCustomerState/);
  assert.match(page, /customerState=\{customerState\}/);
  assert.match(catalogue, /sortRestaurantsForCustomerState/);
  assert.match(catalogue, /extractNigerianState\(left\.address \|\| left\.area\)/);
  assert.match(catalogue, /leftLocal - rightLocal \|\| leftOpen - rightOpen/);
  assert.match(catalogue, /restaurants first/);
});

test("shopping category catalogue keeps local vendors first and ranks open vendors before closed ones", () => {
  const catalogue = read("components/marketplace/shopping-marketplace.tsx");
  assert.match(catalogue, /sortVendorsByState/);
  assert.match(catalogue, /leftPreferred - rightPreferred \|\| leftOpen - rightOpen/);
  assert.match(catalogue, /vendors first/);
  assert.match(catalogue, /vendorStatusLabel\(store\.operatingStatus\)/);
});
