import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const liveTracking = read("components/tracking/live-order-tracking.tsx");
const privateState = read("app/api/account/delivery-live-state/route.ts");
const publicTracking = read("app/api/tracking/route.ts");
const riderMatching = read("components/booking/rider-match-search.tsx");

test("F-052 refreshes the signed-in messenger when a native WebView resumes", () => {
  assert.match(liveTracking, /\/api\/account\/delivery-live-state\?deliveryId=/);
  assert.match(liveTracking, /document\.addEventListener\("visibilitychange", onResume\)/);
  assert.match(liveTracking, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(liveTracking, /window\.addEventListener\("pageshow", onFocus\)/);
  assert.match(riderMatching, /document\.addEventListener\("visibilitychange", onResume\)/);
});

test("F-052 exposes FastConfirm state only through an authenticated owner endpoint", () => {
  assert.match(privateState, /supabase\.auth\.getUser\(\)/);
  assert.match(privateState, /delivery\.customer_id !== user\.id/);
  assert.match(privateState, /metadata: delivery\.metadata \|\| null/);
  assert.match(privateState, /Cache-Control", "no-store, private, max-age=0"/);
  assert.doesNotMatch(publicTracking, /metadata/);
  assert.doesNotMatch(publicTracking, /pickup_proof|storage_path|signedUrl/);
});
