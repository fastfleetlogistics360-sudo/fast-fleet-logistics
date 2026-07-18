import { NextResponse, type NextRequest } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import {
  buildStoragePath,
  logUploadRejection,
  multipartBodyTooLarge,
  uploadErrorResponse,
  validateUpload,
  UploadSecurityError,
  type UploadRejectionCode
} from "@/lib/upload-security";
import { resolveUploadTarget, type UploadKind } from "@/lib/upload-targets";
import {
  persistReplacement,
  removeStoredObject,
  storagePathFromPublicUrl,
  uploadValidatedObject
} from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { StorageQuotaScope } from "@/lib/storage-quota";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let userId: string | null = null;
  let claimedMime: string | null = null;
  let fileSize: number | null = null;

  try {
    const supabase = await createClient();
    const [{ data: authData }, adminContext] = await Promise.all([
      supabase.auth.getUser(),
      requireAdminSession(request)
    ]);
    const user = authData.user;
    userId = user?.id || adminContext?.userId || null;
    if (!user && !adminContext) {
      throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Sign in again before uploading files.", { status: 401 });
    }
    const ingressLimit = await enforceRateLimit(request, rateLimitPolicies.uploadIngress);
    if (ingressLimit) {
      logUploadRejection({ route: "/api/uploads", userId, code: "UPLOAD_RATE_LIMITED", fileSize });
      return ingressLimit;
    }
    if (multipartBodyTooLarge(request)) {
      throw new UploadSecurityError("UPLOAD_TOO_LARGE", "File is too large. Choose a file under 7 MB.");
    }

    const formData = await request.formData().catch(() => null);
    const kind = String(formData?.get("kind") || "") as UploadKind;
    const documentType = String(formData?.get("documentType") || "").trim().toLowerCase();
    const file = formData?.get("file");
    if (!(file instanceof File)) {
      throw new UploadSecurityError("UPLOAD_EMPTY", "Attach a file before uploading.");
    }
    claimedMime = file.type || null;
    fileSize = file.size;

    const target = resolveUploadTarget(kind, documentType);
    if (!target) throw new UploadSecurityError("UPLOAD_UNSUPPORTED_TYPE", "Choose a valid upload type.");
    if (target.adminOnly && !adminContext) {
      throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Admin session required.", { status: 401 });
    }
    if (!target.adminOnly && !user) {
      throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Sign in again before uploading files.", { status: 401 });
    }

    const categoryLimit = await enforceRateLimit(
      request,
      kind === "hero-image"
        ? rateLimitPolicies.uploadAdminMedia
        : kind === "profile-photo"
          ? rateLimitPolicies.uploadAvatar
          : rateLimitPolicies.uploadKyc
    );
    if (categoryLimit) {
      logUploadRejection({ route: "/api/uploads", userId, claimedMime, fileSize, code: "UPLOAD_RATE_LIMITED" });
      return categoryLimit;
    }

    if (user && (kind === "rider-document" || kind === "business-document")) {
      await requireAccountType(supabase, user.id, kind === "rider-document" ? "rider" : "business");
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "File uploads are not configured.", code: "UPLOAD_STORAGE_FAILED" }, { status: 503 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const validated = await validateUpload({
      bytes,
      originalName: file.name,
      declaredMime: file.type,
      profile: target.profile
    });
    const ownerId = target.adminOnly ? adminContext!.userId : user!.id;
    const path = buildStoragePath({ ownerId, profile: target.profile, context: target.context, fileName: validated.fileName });

    const stored =
      kind === "profile-photo"
        ? await replaceProfilePhoto(admin, ownerId, target.bucket, path, validated)
        : await uploadValidatedObject(admin, {
            bucket: target.bucket,
            path,
            upload: validated,
            publicBucket: target.public,
            quota: { ownerId, scope: quotaScopeForUpload(kind) }
          });

    const response = NextResponse.json({
      bucket: stored.bucket,
      path: stored.path,
      publicUrl: stored.publicUrl,
      size: stored.upload.size,
      type: stored.upload.contentType,
      width: stored.upload.width || null,
      height: stored.upload.height || null,
      metadataStripped: stored.upload.metadataStripped
    });
    response.headers.set("Cache-Control", "no-store, private, max-age=0");
    return response;
  } catch (error) {
    const result = uploadErrorResponse(error);
    const code = result.body.code as UploadRejectionCode;
    logUploadRejection({
      route: "/api/uploads",
      userId,
      claimedMime,
      detectedMime: error instanceof UploadSecurityError ? error.detectedMime : null,
      fileSize,
      code
    });
    return NextResponse.json(result.body, { status: result.status });
  }
}

async function requireAccountType(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  expected: "rider" | "business"
) {
  const [{ data: profile }, { data: userRow }] = await Promise.all([
    supabase.from("profiles").select("account_type").eq("user_id", userId).maybeSingle<{ account_type?: string | null }>(),
    supabase.from("users").select("role").eq("id", userId).maybeSingle<{ role?: string | null }>()
  ]);
  if (profile?.account_type !== expected && userRow?.role !== expected) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", `Only ${expected} accounts can upload these documents.`, { status: 403 });
  }
}

async function replaceProfilePhoto(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  userId: string,
  bucket: string,
  path: string,
  upload: Awaited<ReturnType<typeof validateUpload>>
) {
  const [{ data: userRow }, { data: profileRow }] = await Promise.all([
    admin.from("users").select("avatar_url").eq("id", userId).maybeSingle<{ avatar_url?: string | null }>(),
    admin.from("profiles").select("avatar_url").eq("user_id", userId).maybeSingle<{ avatar_url?: string | null }>()
  ]);
  const previousUrls = [userRow?.avatar_url || null, profileRow?.avatar_url || null];
  const previousPaths = previousUrls
    .map((value) => storagePathFromPublicUrl(value, bucket))
    .filter((value): value is string => Boolean(value));

  return persistReplacement({
    uploadNew: () => uploadValidatedObject(admin, { bucket, path, upload, publicBucket: true, quota: { ownerId: userId, scope: "profile_media" } }),
    persistNew: async (stored) => {
      const now = new Date().toISOString();
      const userUpdate = await admin.from("users").update({ avatar_url: stored.publicUrl, updated_at: now }).eq("id", userId);
      if (userUpdate.error) throw userUpdate.error;
      const profileUpdate = await admin.from("profiles").update({ avatar_url: stored.publicUrl, updated_at: now }).eq("user_id", userId);
      if (profileUpdate.error) {
        await admin.from("users").update({ avatar_url: userRow?.avatar_url || null, updated_at: now }).eq("id", userId);
        throw profileUpdate.error;
      }
    },
    removeNew: (stored) => removeStoredObject(admin, stored.bucket, stored.path),
    previousPaths,
    removePrevious: (previousPath) => removeStoredObject(admin, bucket, previousPath)
  });
}

function quotaScopeForUpload(kind: UploadKind): StorageQuotaScope {
  if (kind === "profile-photo") return "profile_media";
  if (kind === "rider-document") return "rider_kyc";
  if (kind === "business-document") return "business_kyc";
  return "admin_media";
}
