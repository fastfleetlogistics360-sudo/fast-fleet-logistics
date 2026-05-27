import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type UploadKind = "profile-photo" | "rider-document" | "business-document";

const uploadTargets: Record<UploadKind, { bucket: string; public: boolean; requiresDocumentType: boolean }> = {
  "profile-photo": { bucket: "profile-photos", public: true, requiresDocumentType: false },
  "rider-document": { bucket: "rider-documents", public: false, requiresDocumentType: true },
  "business-document": { bucket: "business-documents", public: false, requiresDocumentType: true }
};

const maxUploadSize = 7 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in again before uploading files." }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "File uploads are not configured. Add SUPABASE_SERVICE_ROLE_KEY in production." }, { status: 503 });
  }
  const storageAdmin = admin;

  const formData = await request.formData().catch(() => null);
  const kind = formData?.get("kind");
  const file = formData?.get("file");
  const documentType = sanitizeSegment(String(formData?.get("documentType") || ""));

  if (kind !== "profile-photo" && kind !== "rider-document" && kind !== "business-document") {
    return NextResponse.json({ error: "Choose a valid upload type." }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Attach a file before uploading." }, { status: 400 });
  }

  if (file.size > maxUploadSize) {
    return NextResponse.json({ error: "File is too large. Upload an image or PDF under 7 MB." }, { status: 400 });
  }

  const target = uploadTargets[kind];
  if (target.requiresDocumentType && !documentType) {
    return NextResponse.json({ error: "Document type is required for this upload." }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name || "upload");
  const prefix = target.requiresDocumentType ? `${user.id}/${documentType}` : user.id;
  const path = `${prefix}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const upload = await uploadObject(target.bucket, path, bytes, file.type || "application/octet-stream", target.public);
  if (upload.error) {
    return NextResponse.json({ error: friendlyUploadError(upload.error.message) }, { status: 500 });
  }

  const { data } = admin.storage.from(target.bucket).getPublicUrl(path);

  return NextResponse.json({
    bucket: target.bucket,
    path,
    publicUrl: data.publicUrl,
    size: file.size,
    type: file.type || "application/octet-stream"
  });

  async function uploadObject(bucket: string, objectPath: string, body: Buffer, contentType: string, publicBucket: boolean) {
    const attempt = await storageAdmin.storage.from(bucket).upload(objectPath, body, {
      cacheControl: "31536000",
      contentType,
      upsert: true
    });

    if (!isMissingBucketError(attempt.error?.message)) return attempt;

    const create = await storageAdmin.storage.createBucket(bucket, { public: publicBucket });
    if (create.error && !/already exists/i.test(create.error.message)) return { data: null, error: create.error };

    return storageAdmin.storage.from(bucket).upload(objectPath, body, {
      cacheControl: "31536000",
      contentType,
      upsert: true
    });
  }
}

function sanitizeSegment(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}

function sanitizeFileName(value: string) {
  const cleaned = value.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "upload";
}

function isMissingBucketError(message?: string) {
  return Boolean(message && /bucket.*not.*found|not found/i.test(message));
}

function friendlyUploadError(message: string) {
  if (/schema is invalid|incompatible/i.test(message)) {
    return "Supabase Storage rejected the upload because its storage schema is still incompatible. Re-run the schema, then try the upload again.";
  }
  return message || "Upload failed. Try again.";
}
