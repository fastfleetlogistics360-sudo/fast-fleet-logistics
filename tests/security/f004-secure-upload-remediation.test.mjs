import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import {
  UPLOAD_PROFILES,
  UploadSecurityError,
  assertOwnedStoragePath,
  buildStoragePath,
  validateUpload
} from "../../lib/upload-security.ts";
import { persistReplacement } from "../../lib/upload-transaction.ts";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const ownerId = "11111111-1111-4111-8111-111111111111";

test("F-004 accepts genuine JPEG, PNG, and WEBP images and generates opaque filenames", async () => {
  for (const fixture of [
    { format: "jpeg", mime: "image/jpeg", extension: "jpg" },
    { format: "png", mime: "image/png", extension: "png" },
    { format: "webp", mime: "image/webp", extension: "webp" }
  ]) {
    const bytes = await imageFixture(fixture.format, 160, 120);
    const result = await validateUpload({
      bytes,
      originalName: `safe.${fixture.extension}`,
      declaredMime: fixture.mime,
      profile: "kyc-image"
    });
    assert.equal(result.contentType, fixture.mime);
    assert.match(result.fileName, /^[0-9a-f-]{36}\.(?:jpg|png|webp)$/);
    assert.doesNotMatch(result.fileName, /safe/);
  }
});

test("F-004 accepts a structurally valid PDF only for a PDF-enabled profile", async () => {
  const document = await PDFDocument.create();
  document.addPage([320, 240]);
  const bytes = Buffer.from(await document.save());
  const result = await validateUpload({ bytes, originalName: "address-proof.pdf", declaredMime: "application/pdf", profile: "kyc-document" });
  assert.equal(result.contentType, "application/pdf");
  assert.match(result.fileName, /^[0-9a-f-]{36}\.pdf$/);
  await assert.rejects(
    validateUpload({ bytes, originalName: "avatar.pdf", declaredMime: "application/pdf", profile: "avatar" }),
    isUploadError("UPLOAD_UNSUPPORTED_TYPE")
  );
});

test("F-004 rejects PDFs containing active content markers", async () => {
  const document = await PDFDocument.create();
  document.addPage([320, 240]);
  const valid = Buffer.from(await document.save({ useObjectStreams: false }));
  const eof = valid.lastIndexOf(Buffer.from("%%EOF"));
  const active = Buffer.concat([valid.subarray(0, eof), Buffer.from("\n/JavaScript synthetic\n"), valid.subarray(eof)]);
  await assert.rejects(
    validateUpload({ bytes: active, originalName: "active.pdf", declaredMime: "application/pdf", profile: "kyc-document" }),
    isUploadError("UPLOAD_ACTIVE_CONTENT")
  );
});

test("F-004 rejects executable, HTML, JavaScript, SVG, and unsupported content renamed as allowed files", async () => {
  const samples = [
    { bytes: Buffer.from("MZ harmless synthetic executable marker"), name: "identity.jpg", mime: "image/jpeg" },
    { bytes: Buffer.from("<!doctype html><title>synthetic</title>"), name: "photo.png", mime: "image/png" },
    { bytes: Buffer.from("console.log('synthetic')"), name: "receipt.pdf", mime: "application/pdf" },
    { bytes: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), name: "logo.svg", mime: "image/svg+xml" },
    { bytes: Buffer.from("GIF89a synthetic"), name: "animation.gif", mime: "image/gif" }
  ];
  for (const sample of samples) {
    await assert.rejects(
      validateUpload({ bytes: sample.bytes, originalName: sample.name, declaredMime: sample.mime, profile: "kyc-document" }),
      (error) => error instanceof UploadSecurityError
    );
  }
});

test("F-004 rejects MIME mismatch, extension mismatch, and dangerous double extensions", async () => {
  const png = await imageFixture("png", 128, 128);
  await assert.rejects(
    validateUpload({ bytes: png, originalName: "photo.png", declaredMime: "image/jpeg", profile: "avatar" }),
    isUploadError("UPLOAD_SIGNATURE_MISMATCH")
  );
  await assert.rejects(
    validateUpload({ bytes: png, originalName: "photo.jpg", declaredMime: "image/png", profile: "avatar" }),
    isUploadError("UPLOAD_SIGNATURE_MISMATCH")
  );
  await assert.rejects(
    validateUpload({ bytes: png, originalName: "photo.exe.png", declaredMime: "image/png", profile: "avatar" }),
    isUploadError("UPLOAD_UNSAFE_FILENAME")
  );
  for (const name of ["identity.jpg.exe", "passport.png.php", "receipt.pdf.js", "selfie.webp.html"]) {
    await assert.rejects(
      validateUpload({ bytes: png, originalName: name, declaredMime: "image/png", profile: "avatar" }),
      (error) => error instanceof UploadSecurityError
    );
  }
});

test("F-004 rejects empty and oversized files before expensive decoding", async () => {
  await assert.rejects(
    validateUpload({ bytes: Buffer.alloc(0), originalName: "empty.jpg", declaredMime: "image/jpeg", profile: "avatar" }),
    isUploadError("UPLOAD_EMPTY")
  );
  await assert.rejects(
    validateUpload({ bytes: Buffer.alloc(UPLOAD_PROFILES.avatar.maxBytes + 1), originalName: "large.jpg", declaredMime: "image/jpeg", profile: "avatar" }),
    isUploadError("UPLOAD_TOO_LARGE")
  );
});

test("F-004 rejects malformed images and excessive dimensions", async () => {
  const validPng = await imageFixture("png", 128, 128);
  const malformedPng = validPng.subarray(0, Math.max(33, Math.floor(validPng.length / 3)));
  await assert.rejects(
    validateUpload({ bytes: malformedPng, originalName: "broken.png", declaredMime: "image/png", profile: "avatar" }),
    isUploadError("UPLOAD_INVALID_IMAGE")
  );

  const tooWide = await imageFixture("png", 8200, 32);
  await assert.rejects(
    validateUpload({ bytes: tooWide, originalName: "wide.png", declaredMime: "image/png", profile: "avatar" }),
    isUploadError("UPLOAD_DIMENSIONS_EXCEEDED")
  );
});

test("F-004 strips image metadata for public photos but preserves KYC originals", async () => {
  const original = await sharp({
    create: { width: 128, height: 128, channels: 3, background: { r: 32, g: 96, b: 160 } }
  })
    .jpeg()
    .withMetadata({ orientation: 6, density: 300 })
    .toBuffer();

  const avatar = await validateUpload({ bytes: original, originalName: "avatar.jpg", declaredMime: "image/jpeg", profile: "avatar" });
  const avatarMetadata = await sharp(avatar.bytes).metadata();
  assert.equal(avatar.metadataStripped, true);
  assert.equal(avatar.contentType, "image/webp");
  assert.equal(avatarMetadata.exif, undefined);

  const kyc = await validateUpload({ bytes: original, originalName: "identity.jpg", declaredMime: "image/jpeg", profile: "kyc-image" });
  assert.equal(kyc.metadataStripped, false);
  assert.deepEqual(kyc.bytes, original);
});

test("F-004 rejects traversal paths and cross-account object claims", () => {
  assert.throws(
    () => buildStoragePath({ ownerId, profile: "avatar", context: "profile", fileName: "../avatar.jpg" }),
    isUploadError("UPLOAD_UNSAFE_FILENAME")
  );
  const path = buildStoragePath({
    ownerId,
    profile: "kyc-image",
    context: "government_id",
    fileName: "22222222-2222-4222-8222-222222222222.jpg"
  });
  assert.equal(assertOwnedStoragePath({ path, ownerId, profile: "kyc-image", context: "government_id" }), path);
  assert.throws(
    () => assertOwnedStoragePath({ path, ownerId: "33333333-3333-4333-8333-333333333333", profile: "kyc-image", context: "government_id" }),
    isUploadError("UPLOAD_UNAUTHORIZED")
  );
});

test("F-004 failed replacement deletes the new object and preserves the previous valid file", async () => {
  const removed = [];
  await assert.rejects(
    persistReplacement({
      uploadNew: async () => ({ path: "new.webp" }),
      persistNew: async () => { throw new Error("synthetic database failure"); },
      removeNew: async (upload) => { removed.push(upload.path); },
      previousPaths: ["previous.webp"],
      removePrevious: async (path) => { removed.push(path); }
    }),
    /synthetic database failure/
  );
  assert.deepEqual(removed, ["new.webp"]);
});

test("F-004 successful replacement removes old objects only after the new reference persists", async () => {
  const events = [];
  await persistReplacement({
    uploadNew: async () => { events.push("upload:new"); return { path: "new.webp" }; },
    persistNew: async () => { events.push("persist:new"); },
    removeNew: async () => { events.push("remove:new"); },
    previousPaths: ["previous.webp"],
    removePrevious: async () => { events.push("remove:previous"); }
  });
  assert.deepEqual(events, ["upload:new", "persist:new", "remove:previous"]);
});

test("F-004 routes enforce auth, ownership, rate limits, private serving, and cleanup", () => {
  const uploadRoute = read("app/api/uploads/route.ts");
  const proofRoute = read("app/api/rider/pickup-proof/route.ts");
  const accessRoute = read("app/api/uploads/access/route.ts");
  const riderApplication = read("app/api/rider/applications/route.ts");
  const businessRegistration = read("app/api/business/registration/route.ts");
  const trackingRoute = read("app/api/tracking/route.ts");
  const serviceWorker = read("public/sw.js");

  assert.match(uploadRoute, /enforceRateLimit\(request, rateLimitPolicies\.uploadIngress\)/);
  assert.match(uploadRoute, /requireAccountType/);
  assert.match(uploadRoute, /validateUpload/);
  assert.match(uploadRoute, /persistReplacement/);
  assert.match(proofRoute, /delivery\.rider_id !== rider\.id/);
  assert.match(proofRoute, /publicBucket: false/);
  assert.match(proofRoute, /removeNew:/);
  assert.match(accessRoute, /deliveryConfirmationOwnerIds/);
  assert.match(accessRoute, /rider\?\.user_id/);
  assert.match(accessRoute, /validateStoredObjectForAccess/);
  assert.match(accessRoute, /createSignedUrl\(path, 60/);
  assert.match(accessRoute, /download: target\.downloadName/);
  assert.match(riderApplication, /verifyRiderKycUploads/);
  assert.match(riderApplication, /rollbackRiderDocuments/);
  assert.match(riderApplication, /cleanupUnreferencedRiderUploads/);
  assert.match(businessRegistration, /verifyBusinessKycUploads/);
  assert.match(businessRegistration, /cleanupUnreferencedBusinessUploads/);
  assert.doesNotMatch(trackingRoute, /metadata: data\.metadata/);
  assert.match(serviceWorker, /isPrivateRequest\(url\.pathname\)/);
  assert.match(serviceWorker, /pathname\.startsWith\("\/api\/"\)/);
});

test("F-004 migration makes sensitive buckets private and removes direct browser writes", () => {
  const migration = read("supabase-secure-upload-delta.sql");
  assert.match(migration, /'delivery-proofs', 'delivery-proofs', false/);
  assert.match(migration, /'rider-documents', 'rider-documents', false/);
  assert.match(migration, /'business-documents', 'business-documents', false/);
  assert.match(migration, /file_size_limit/);
  assert.match(migration, /allowed_mime_types/);
  assert.match(migration, /drop policy if exists "Users upload own profile photos"/);
  assert.match(migration, /create policy "Delivery participants read delivery proofs"/);
  assert.doesNotMatch(migration, /create policy "Riders upload own documents"/);
  assert.doesNotMatch(migration, /create policy "Businesses upload own documents"/);
  assert.doesNotMatch(migration, /create policy "Assigned riders upload delivery proofs"/);
});

async function imageFixture(format, width, height) {
  const image = sharp({ create: { width, height, channels: 3, background: { r: 32, g: 96, b: 160 } } });
  if (format === "jpeg") return image.jpeg().toBuffer();
  if (format === "png") return image.png().toBuffer();
  return image.webp().toBuffer();
}

function isUploadError(code) {
  return (error) => error instanceof UploadSecurityError && error.code === code;
}
