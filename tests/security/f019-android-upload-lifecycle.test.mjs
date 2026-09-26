import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rider = readFileSync("components/onboarding/rider-onboarding-flow.tsx", "utf8");
const storage = readFileSync("lib/storage.ts", "utf8");
const businessOnboarding = readFileSync("components/onboarding/business-registration-flow.tsx", "utf8");
const riderDashboard = readFileSync("components/rider/rider-dashboard.tsx", "utf8");
const fastErrands = readFileSync("components/admin/fast-errands-admin-queue.tsx", "utf8");
const uploadSecurity = readFileSync("lib/upload-security.ts", "utf8");

test("Android rider onboarding uses picker-first image selection and serializes uploads", () => {
  assert.doesNotMatch(rider, /capture=/);
  assert.doesNotMatch(businessOnboarding, /capture=/);
  assert.match(rider, /uploadInFlight/);
  assert.match(rider, /Please wait for the current upload/);
  assert.match(rider, /event\.currentTarget\.value = ""/);
});

test("lifecycle restoration only retains form fields and completed server uploads", () => {
  assert.match(rider, /sessionStorage\.getItem\(riderOnboardingDraftKey\)/);
  assert.match(rider, /pagehide/);
  assert.match(rider, /visibilitychange/);
  assert.match(rider, /restoredDocuments/);
  assert.match(rider, /progress: 100/);
  assert.match(rider, /accountNumber: _accountNumber/);
  assert.match(rider, /accountName: _accountName/);
  assert.match(rider, /sessionStorage\.removeItem\(riderOnboardingDraftKey\)/);
});

test("low-memory upload path never decodes or base64-encodes a selected image in the browser", () => {
  assert.doesNotMatch(storage, /FileReader|readAsDataURL|createImageBitmap|drawImage|canvas\.toBlob|toDataURL/);
  assert.match(storage, /body\.set\("file", file\)/);
  assert.match(storage, /validateClientUpload/);
  assert.match(storage, /runExclusiveBrowserUpload/);
  assert.match(riderDashboard, /runExclusiveBrowserUpload/);
  assert.match(fastErrands, /runExclusiveBrowserUpload/);
});

test("12–50 MP selections remain raw in the browser and are bounded on the server", () => {
  assert.match(storage, /do not decode camera images in[\s\S]*browser/);
  assert.match(uploadSecurity, /const IMAGE_MAX_PIXELS = 25_000_000/);
  assert.match(uploadSecurity, /limitInputPixels: profile\.maxPixels/);
});

test("cancellation, reselection, corrupt files, and back-to-back uploads have safe exits", () => {
  assert.match(rider, /event\.currentTarget\.value = ""/);
  assert.match(businessOnboarding, /event\.currentTarget\.value = ""/);
  assert.match(storage, /The selected file is empty/);
  assert.match(storage, /Choose a JPEG, PNG, or WEBP image/);
  assert.match(storage, /Another upload is still in progress/);
});
