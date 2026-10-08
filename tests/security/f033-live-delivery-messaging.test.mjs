import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("F033: delivery notifications refresh the live customer and business views immediately", async () => {
  const [registrar, customer, business, tracking] = await Promise.all([
    source("components/notifications/push-notification-registrar.tsx"),
    source("components/dashboard/customer-dashboard.tsx"),
    source("components/dashboard/business-dashboard.tsx"),
    source("components/tracking/live-order-tracking.tsx")
  ]);
  assert.match(registrar, /new CustomEvent\("fastfleet:delivery-update"/);
  assert.match(customer, /setOrders\(mergedOrders\)[\s\S]*enrichOrdersWithRiderDetails/);
  assert.match(customer, /window\.addEventListener\("fastfleet:delivery-update"/);
  assert.match(business, /window\.addEventListener\("fastfleet:delivery-update"/);
  assert.match(tracking, /window\.addEventListener\("fastfleet:delivery-update"/);
  assert.match(tracking, /\}, 12000\)/);
});

test("F033: FastConfirm is visible in the compact messenger and business has a persistent delivery workspace", async () => {
  const [sheet, business] = await Promise.all([
    source("components/dashboard/active-order-messenger-sheet.tsx"),
    source("components/dashboard/business-dashboard.tsx")
  ]);
  assert.match(sheet, /pickupProofFromMetadata/);
  assert.match(sheet, /FastConfirm photo/);
  assert.match(sheet, /priority/);
  assert.match(business, /DeliveryMessagesTab/);
  assert.match(business, /Delivery messages/);
  assert.match(business, /Dispatch monitor/);
});

test("F033: rider order views receive vendor identity and landing pages omit app-store promotion", async () => {
  const [jobs, workflow, rider, launch, main] = await Promise.all([
    source("app/api/rider/jobs/route.ts"),
    source("lib/marketplace-order-workflow.ts"),
    source("components/rider/rider-dashboard.tsx"),
    source("components/landing/launch-landing-page.tsx"),
    source("components/landing/main-page-sections.tsx")
  ]);
  assert.match(jobs, /withVendorName/);
  assert.match(jobs, /vendor_name/);
  assert.match(workflow, /marketplace_vendor_snapshot: snapshot/);
  assert.match(rider, /Restaurant \/ vendor/);
  assert.match(rider, /Vendor: \{job\.vendor_name\}/);
  assert.doesNotMatch(launch, /Download on the|Google Play|App Store/);
  assert.doesNotMatch(main, /Mobile apps are coming soon|Play Store|App Store/);
});
