import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UploadSecurityError,
  assertOwnedStoragePath,
  validateUpload,
  type UploadProfileName,
  type ValidatedUpload
} from "@/lib/upload-security";
export { persistReplacement } from "@/lib/upload-transaction";

export type StoredUpload = {
  bucket: string;
  path: string;
  publicUrl: string | null;
  upload: ValidatedUpload;
};

export async function uploadValidatedObject(
  db: SupabaseClient,
  input: { bucket: string; path: string; upload: ValidatedUpload; publicBucket: boolean }
): Promise<StoredUpload> {
  const result = await db.storage.from(input.bucket).upload(input.path, input.upload.bytes, {
    cacheControl: input.publicBucket ? "31536000" : "no-cache",
    contentType: input.upload.contentType,
    upsert: false
  });
  if (result.error) {
    throw new UploadSecurityError("UPLOAD_STORAGE_FAILED", friendlyStorageError(result.error.message), { status: 500 });
  }

  const publicUrl = input.publicBucket ? db.storage.from(input.bucket).getPublicUrl(input.path).data.publicUrl : null;
  return { bucket: input.bucket, path: input.path, publicUrl, upload: input.upload };
}

export async function verifyOwnedStoredUpload(
  db: SupabaseClient,
  input: {
    bucket: string;
    path: string;
    ownerId: string;
    profile: UploadProfileName;
    context?: string;
  }
) {
  const path = assertOwnedStoragePath({
    path: input.path,
    ownerId: input.ownerId,
    profile: input.profile,
    context: input.context
  });
  const result = await db.storage.from(input.bucket).download(path);
  if (result.error || !result.data) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "The uploaded file could not be verified for this account.", { status: 403 });
  }

  const bytes = Buffer.from(await result.data.arrayBuffer());
  const upload = await validateUpload({
    bytes,
    originalName: path.split("/").at(-1) || "",
    declaredMime: result.data.type,
    profile: input.profile,
    requireDeclaredMime: false
  });
  return { bucket: input.bucket, path, upload };
}

export async function validateStoredObjectForAccess(
  db: SupabaseClient,
  input: { bucket: string; path: string; profile: UploadProfileName }
) {
  const path = normalizeStoredPath(input.path);
  const result = await db.storage.from(input.bucket).download(path);
  if (result.error || !result.data) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "The requested file is unavailable.", { status: 404 });
  }

  const bytes = Buffer.from(await result.data.arrayBuffer());
  await validateUpload({
    bytes,
    originalName: path.split("/").at(-1) || "",
    declaredMime: result.data.type,
    profile: input.profile,
    requireDeclaredMime: false
  });
  return path;
}

export async function removeStoredObject(db: SupabaseClient, bucket: string, path?: string | null) {
  if (!path) return;
  const result = await db.storage.from(bucket).remove([path]);
  if (result.error) throw result.error;
}

export function storagePathFromPublicUrl(value: string | null | undefined, bucket: string) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const index = url.pathname.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function friendlyStorageError(message: string) {
  if (/bucket.*not.*found|not found/i.test(message)) {
    return "File storage is not configured. Apply the secure upload migration before accepting uploads.";
  }
  if (/duplicate|already exists/i.test(message)) return "A storage conflict occurred. Please choose the file again.";
  return "File storage is temporarily unavailable. Please try again.";
}

function normalizeStoredPath(value: string) {
  const path = String(value || "").trim();
  if (!path || path.startsWith("/") || path.includes("\\") || path.includes("..") || /%2e|%2f|%5c/i.test(path)) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "The requested file is unavailable.", { status: 404 });
  }
  return path;
}
