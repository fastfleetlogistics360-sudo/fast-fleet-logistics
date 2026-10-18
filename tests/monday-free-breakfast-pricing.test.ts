import assert from "node:assert/strict";
import test from "node:test";
import { mondayBreakfastPayable } from "../lib/promos/monday-free-breakfast.ts";

test("pickup: a fully subsidized food cart still pays the platform fee", () => {
  assert.deepEqual(
    mondayBreakfastPayable({ foodSubtotalNgn: 3000, subsidyNgn: 3000, platformFeeNgn: 300, deliveryFeeNgn: 0 }),
    { foodSubtotalNgn: 3000, subsidyNgn: 3000, customerFoodAmountNgn: 0, platformFeeNgn: 300, deliveryFeeNgn: 0, totalNgn: 300 }
  );
});

test("delivery: a fully subsidized food cart still pays full platform and delivery fees", () => {
  const price = mondayBreakfastPayable({ foodSubtotalNgn: 3000, subsidyNgn: 3000, platformFeeNgn: 300, deliveryFeeNgn: 1200 });
  assert.equal(price.customerFoodAmountNgn, 0);
  assert.equal(price.platformFeeNgn, 300);
  assert.equal(price.deliveryFeeNgn, 1200);
  assert.equal(price.totalNgn, 1500);
});

test("only the food balance above ₦3,000 remains payable", () => {
  const price = mondayBreakfastPayable({ foodSubtotalNgn: 4500, subsidyNgn: 3000, platformFeeNgn: 300, deliveryFeeNgn: 1200 });
  assert.equal(price.customerFoodAmountNgn, 1500);
  assert.equal(price.totalNgn, 3000);
});

test("the discount can never reduce a configured fee", () => {
  const price = mondayBreakfastPayable({ foodSubtotalNgn: 2000, subsidyNgn: 99999, platformFeeNgn: 425, deliveryFeeNgn: 875 });
  assert.equal(price.subsidyNgn, 2000);
  assert.equal(price.platformFeeNgn, 425);
  assert.equal(price.deliveryFeeNgn, 875);
  assert.equal(price.totalNgn, 1300);
});
