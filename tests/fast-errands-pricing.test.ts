import test from "node:test";
import assert from "node:assert/strict";
import { findFastErrandBand, fastErrandMinimumProgress, validateFastErrandBands } from "../lib/fast-errands-pricing.ts";

const bands = [
  { min_distance_exclusive_meters: 0, max_distance_inclusive_meters: 2000, service_fee_ngn: 1000 },
  { min_distance_exclusive_meters: 2000, max_distance_inclusive_meters: 4000, service_fee_ngn: 1200 },
  { min_distance_exclusive_meters: 4000, max_distance_inclusive_meters: 6000, service_fee_ngn: 1500 },
  { min_distance_exclusive_meters: 6000, max_distance_inclusive_meters: 8000, service_fee_ngn: 1800 },
  { min_distance_exclusive_meters: 8000, max_distance_inclusive_meters: 10000, service_fee_ngn: 2200 }
];

test("FastErrand minimum uses goods only", () => {
  assert.equal(fastErrandMinimumProgress(1499, 1500), 1);
  assert.equal(fastErrandMinimumProgress(1500, 1500), 0);
});

test("FastErrand raw-metre distance bands have correct boundaries", () => {
  for (const [metres, fee] of [[2000, 1000], [2010, 1200], [4000, 1200], [4010, 1500], [6000, 1500], [6010, 1800], [8000, 1800], [8010, 2200], [10000, 2200]] as const) {
    assert.equal(findFastErrandBand(metres, bands)?.feeNgn, fee);
  }
  assert.equal(findFastErrandBand(10010, bands), null);
});

test("FastErrand service area schedule rejects gaps and overlaps", () => {
  assert.equal(validateFastErrandBands(bands, 10000).valid, true);
  assert.equal(validateFastErrandBands([{ ...bands[0] }, { ...bands[1], min_distance_exclusive_meters: 2001 }], 4000).valid, false);
});
