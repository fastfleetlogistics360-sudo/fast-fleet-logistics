import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { validateClientUpload } from "../../lib/storage.ts";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");

test("F-010 keeps expensive image optimization off client upload paths", () => {
  const storage = read("lib/storage.ts");
  const riderDashboard = read("components/rider/rider-dashboard.tsx");

  assert.doesNotMatch(storage, /createImageBitmap|drawImage|canvas\.toBlob|FileReader|readAsDataURL/);
  assert.match(storage, /profile: \{ maxBytes: 4 \* MB/);
  assert.match(storage, /"kyc-image": \{ maxBytes: 6 \* MB/);
  assert.match(storage, /"delivery-proof": \{ maxBytes: 5 \* MB/);
  assert.match(storage, /uploadViaApi\("profile-photo", file/);
  assert.match(storage, /uploadViaApi\("hero-image", file/);
  assert.match(storage, /uploadViaApi\("marketplace-image", file/);
  assert.match(riderDashboard, /body\.set\("file", file\)/);
  assert.doesNotMatch(riderDashboard, /compressImage/);
});

test("F-010 preserves server-side authoritative image protections", () => {
  const security = read("lib/upload-security.ts");
  const uploadRoute = read("app/api/uploads/route.ts");

  assert.match(security, /const IMAGE_MAX_PIXELS = 25_000_000/);
  assert.match(security, /maxWidth: 8192/);
  assert.match(security, /limitInputPixels: profile\.maxPixels/);
  assert.match(security, /\.rotate\(\)\s*\.resize\(/);
  assert.match(uploadRoute, /Buffer\.from\(await file\.arrayBuffer\(\)\)/);
  assert.match(uploadRoute, /validateUpload/);
});

test("F-010 applies inexpensive category limits before upload", () => {
  const fourMegabytePhoto = new File([new Uint8Array(4 * 1024 * 1024)], "profile.jpg", { type: "image/jpeg" });
  const oversizedProfilePhoto = new File([new Uint8Array(4 * 1024 * 1024 + 1)], "profile.jpg", { type: "image/jpeg" });
  const sixMegabyteKycPhoto = new File([new Uint8Array(6 * 1024 * 1024)], "id.jpg", { type: "image/jpeg" });

  assert.doesNotThrow(() => validateClientUpload(fourMegabytePhoto, "profile"));
  assert.throws(() => validateClientUpload(oversizedProfilePhoto, "profile"), /smaller than 4 MB/);
  assert.doesNotThrow(() => validateClientUpload(sixMegabyteKycPhoto, "kyc-image"));
  assert.throws(() => validateClientUpload(sixMegabyteKycPhoto, "delivery-proof"), /smaller than 5 MB/);
});
