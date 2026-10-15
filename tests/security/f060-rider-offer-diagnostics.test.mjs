import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync("components/rider/rider-dashboard.tsx", "utf8");
const distanceRoute = readFileSync("app/api/maps/distance/route.ts", "utf8");

test("F060: production rider offers never fall back to an unguarded browser query", () => {
  assert.match(dashboard, /if \(process\.env\.NODE_ENV === "production"\) return \[\] as JobRow\[\];/);
  assert.match(dashboard, /Production always uses the server gate/);
});

test("F060: rider acceptance failures are visible above the blocking offer modal", () => {
  assert.match(dashboard, /offerNotice=\{offerNotice\}/);
  assert.match(dashboard, /role="alert"/);
  assert.match(dashboard, /Could not update job \(HTTP \$\{response\.status\}\)/);
  assert.match(dashboard, /finally \{\s*setRespondingJobId\(null\);/);
});

test("F060: pickup ETA routes coordinate pairs as coordinates and does not synthesize a fallback ETA", () => {
  assert.match(distanceRoute, /const originCoordinates = parseCoordinates\(origin\)/);
  assert.match(distanceRoute, /origin: originCoordinates \|\| \{ address: origin \}/);
  assert.doesNotMatch(dashboard, /function fallbackPickupEta/);
  assert.match(dashboard, /maps response is the only authoritative estimate/);
});
