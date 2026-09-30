import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Care360 attachments are private, bounded, and service-role mediated", () => {
  const migration = read("security-remediation/migrations/202609280003_care360_phase4_foundation.sql");
  const customerUpload = read("app/api/support/cases/[id]/attachments/route.ts");
  const access = read("app/api/support/cases/[id]/attachments/[attachmentId]/route.ts");
  assert.match(migration, /support_case_attachments/);
  assert.match(migration, /support-attachments/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.support_case_attachments from authenticated/);
  assert.match(migration, /Support attachment identity fields are immutable/);
  assert.match(customerUpload, /MAX_FILES = 5/);
  assert.match(customerUpload, /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(customerUpload, /eq\("id", id\)\.eq\("user_id", user\.id\)/);
  assert.match(customerUpload, /uploadValidatedObject/);
  assert.match(customerUpload, /removeStoredObject/);
  assert.match(access, /createSignedUrl\(path, 60/);
  assert.match(access, /data\.visibility !== "public"/);
});

test("Care360 lifecycle is scheduled, authenticated, and no longer mutates during reads", () => {
  const cron = read("app/api/cron/care360/route.ts");
  const customerRead = read("app/api/support/cases/[id]/route.ts");
  const inboxRead = read("app/api/admin/customer-care/cases/route.ts");
  const config = read("vercel.json");
  assert.match(cron, /authorizeCronRequest\(request\)/);
  assert.match(cron, /CASE_AUTO_CLOSED/);
  assert.match(cron, /FIRST_RESPONSE_SLA_BREACHED/);
  assert.match(cron, /RESOLUTION_SLA_BREACHED/);
  assert.match(config, /"path": "\/api\/cron\/care360"/);
  assert.doesNotMatch(customerRead, /shouldAutoClose/);
  assert.doesNotMatch(inboxRead, /\.update\(\{ status: "closed"/);
});
