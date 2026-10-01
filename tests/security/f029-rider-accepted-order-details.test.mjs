import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("components/rider/rider-dashboard.tsx", "utf8");
const jobs = readFileSync("app/api/rider/jobs/route.ts", "utf8");

test("accepted rider jobs render cart item images, pricing, quantities, and the FastErrand customer note", () => {
  assert.match(dashboard, /function AcceptedOrderContents/);
  assert.match(dashboard, /item\.imageUrl \|\| "\/fast-errands\/foodstuff\.webp"/);
  assert.match(dashboard, /formatMoney\(item\.price\)\} each/);
  assert.match(dashboard, /Quantity \{item\.quantity\}/);
  assert.match(dashboard, /function customerNoteForJob/);
  assert.match(dashboard, /job\.status === "searching" && !job\.rider_id/);
  assert.match(dashboard, /fast_errand/);
  assert.match(dashboard, />Customer note</);
});

test("unaccepted offers remain stripped of metadata while assigned jobs retain their authorized order details", () => {
  assert.match(jobs, /if \(job\.status !== "searching" \|\| job\.rider_id\) return job/);
  assert.match(jobs, /delete offer\.metadata/);
  assert.match(jobs, /const jobSelect/);
  assert.match(jobs, /metadata/);
});
