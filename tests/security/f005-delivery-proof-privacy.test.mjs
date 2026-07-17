import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const proofUpload = read("app/api/rider/pickup-proof/route.ts");
const proofAccess = read("app/api/uploads/access/route.ts");
const publicTracking = read("app/api/tracking/route.ts");
const publicTrackingUi = read("components/realtime/tracking-console.tsx");
const customerReview = read("app/api/customer/pickup-proof/route.ts");
const serviceWorker = read("public/sw.js");
const migration = read("supabase-secure-upload-delta.sql");
const projectDocumentation = read("PROJECT_DOCUMENTATION.md");
const productionChecklist = read("SUPABASE_PRODUCTION_GO_LIVE.md");

test("F-005 stores delivery proofs privately and never creates a public proof URL", () => {
  assert.match(migration, /'delivery-proofs', 'delivery-proofs', false/);
  assert.match(proofUpload, /bucket: "delivery-proofs"/);
  assert.match(proofUpload, /publicBucket: false/);
  assert.match(proofUpload, /\/api\/uploads\/access\?scope=delivery-proof/);
  assert.doesNotMatch(proofUpload, /getPublicUrl|createSignedUrl|storage\/v1\/object\/public/);
});

test("F-005 permits proof upload only for the assigned rider after pickup", () => {
  assert.match(proofUpload, /\.eq\("user_id", user\.id\)/);
  assert.match(proofUpload, /delivery\.rider_id !== rider\.id/);
  assert.match(proofUpload, /delivery\.status !== "picked_up"/);
  assert.match(proofUpload, /isCustomerPickupProofRequired\(delivery\.metadata\)/);
  assert.match(proofUpload, /buildStoragePath\(\{ ownerId: user\.id, profile: "delivery-proof", context: delivery\.id/);
});

test("F-005 authorizes proof access for the customer, assigned rider, or admin only", () => {
  assert.match(proofAccess, /if \(!userId && !adminContext\)/);
  assert.match(proofAccess, /deliveryConfirmationOwnerIds\(delivery\)/);
  assert.match(proofAccess, /rider\?\.user_id/);
  assert.match(proofAccess, /if \(!isAdmin && \(!userId \|\| !participantIds\.has\(userId\)\)\) return null/);
  assert.match(proofAccess, /if \(!isAccessScope\(scope\) \|\| !isUuid\(id\)\) return unavailable\(\)/);
  assert.match(proofAccess, /validateStoredObjectForAccess/);
});

test("F-005 proof links are short-lived, private, and safe to serve", () => {
  assert.match(proofAccess, /createSignedUrl\(path, 60/);
  assert.match(proofAccess, /Cache-Control", "no-store, private, max-age=0"/);
  assert.match(proofAccess, /Referrer-Policy", "no-referrer"/);
  assert.match(proofAccess, /X-Content-Type-Options", "nosniff"/);
  assert.doesNotMatch(proofAccess, /console\.log\(.*signed|signedUrl.*json/u);
});

test("F-005 public tracking has no proof metadata, path, or image surface", () => {
  assert.doesNotMatch(publicTracking, /metadata/);
  assert.doesNotMatch(publicTracking, /proof_url|pickup_proof|storage_path|signedUrl/);
  assert.doesNotMatch(publicTrackingUi, /PackagePickupProof|pickup_proof|proof_url|storage_path|signedUrl/);
});

test("F-005 customers review proof state but cannot replace or remove proof files", () => {
  assert.match(customerReview, /delivery\.customer_id !== user\.id/);
  assert.match(customerReview, /from\("deliveries"\)\.update\(\{ metadata: nextMetadata/);
  assert.doesNotMatch(customerReview, /storage\.from|removeStoredObject|\.upload\(/);
  assert.doesNotMatch(customerReview, /error instanceof Error \? error\.message/);
});

test("F-005 replacement failures remove only the new proof and preserve the prior proof", () => {
  assert.match(proofUpload, /persistReplacement\(/);
  assert.match(proofUpload, /removeNew: \(stored\) => removeStoredObject\(admin, stored\.bucket, stored\.path\)/);
  assert.match(proofUpload, /staleHistoryPaths/);
  assert.match(proofUpload, /await persistReplacement[\s\S]*?staleHistoryPaths/u);
});

test("F-005 does not cache secure proof access, signed proof images, or private proof pages", () => {
  assert.match(serviceWorker, /const PAGES_CACHE = "fastfleet-pages-v15"/);
  assert.match(serviceWorker, /isPrivateProofRequest\(url\.pathname\)/);
  assert.match(serviceWorker, /fetch\(request, \{ cache: "no-store" \}\)/);
  for (const path of ["/api/uploads/access", "/account/orders/", "/customer/", "/rider/"]) {
    assert.match(serviceWorker, new RegExp(`pathname\\.startsWith\\("${escapeRegExp(path)}"\\)`));
  }
  assert.match(serviceWorker, /pathname === "\/dashboard"/);
});

test("F-005 storage policy matches the server-owned proof workflow", () => {
  assert.match(migration, /drop policy if exists "Assigned riders upload delivery proofs"/);
  assert.match(migration, /create policy "Delivery participants read delivery proofs"/);
  assert.match(migration, /d\.customer_id = auth\.uid\(\)/);
  assert.match(migration, /rp\.user_id = auth\.uid\(\)/);
  assert.match(migration, /public\.current_user_is_admin\(\)/);
  assert.doesNotMatch(migration, /create policy "Assigned riders upload delivery proofs"/);
});

test("F-005 production documentation requires the secure-upload delta and marks proofs private", () => {
  assert.match(projectDocumentation, /\| `delivery-proofs` \| No \|/);
  assert.match(productionChecklist, /Do \*\*not\*\* rerun the complete `supabase-schema\.sql`/);
  assert.match(productionChecklist, /run `supabase-secure-upload-delta\.sql` once/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
