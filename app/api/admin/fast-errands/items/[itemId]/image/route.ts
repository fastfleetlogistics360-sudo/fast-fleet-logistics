import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { buildStoragePath, multipartBodyTooLarge, validateUpload, UploadSecurityError, uploadErrorResponse } from "@/lib/upload-security";
import { persistReplacement, removeStoredObject, uploadValidatedObject } from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  try {
    if (multipartBodyTooLarge(request)) throw new UploadSecurityError("UPLOAD_TOO_LARGE", "File is too large. Choose a file under 7 MB.");
    const { itemId } = await context.params;
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File)) throw new UploadSecurityError("UPLOAD_EMPTY", "Choose a JPEG, PNG, or WEBP image.");
    const db = createAdminClient(); if (!db) return NextResponse.json({ error: "Product media is not configured." }, { status: 503 });
    const { data: item, error } = await db.from("fast_errand_catalog_items").select("id, image_path").eq("id", itemId).maybeSingle<{ id: string; image_path?: string | null }>();
    if (error || !item) return NextResponse.json({ error: "FastErrand item not found." }, { status: 404 });
    const upload = await validateUpload({ bytes: Buffer.from(await file.arrayBuffer()), originalName: file.name, declaredMime: file.type, profile: "marketplace-product-image" });
    const path = buildStoragePath({ ownerId: admin.userId, profile: "marketplace-product-image", context: `fast-errands/${item.id}`, fileName: upload.fileName });
    const stored = await persistReplacement({
      uploadNew: () => uploadValidatedObject(db, { bucket: "marketplace-images", path, upload, publicBucket: true, quota: { ownerId: admin.userId, scope: "admin_media" } }),
      persistNew: async (next) => { const result = await db.from("fast_errand_catalog_items").update({ image_url: next.publicUrl, image_path: next.path, updated_at: new Date().toISOString() }).eq("id", item.id); if (result.error) throw result.error; },
      removeNew: (next) => removeStoredObject(db, next.bucket, next.path),
      previousPaths: item.image_path ? [item.image_path] : [],
      removePrevious: (previous) => removeStoredObject(db, "marketplace-images", previous)
    });
    return NextResponse.json({ imageUrl: stored.publicUrl, imagePath: stored.path });
  } catch (error) {
    const result = uploadErrorResponse(error); return NextResponse.json(result.body, { status: result.status });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ itemId: string }> }) {
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request, "destructive"); if (limited) return limited;
  const { itemId } = await context.params; const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Product media is not configured." }, { status: 503 });
  const { data: item } = await db.from("fast_errand_catalog_items").select("id, image_path").eq("id", itemId).maybeSingle<{ id: string; image_path?: string | null }>();
  if (!item) return NextResponse.json({ error: "FastErrand item not found." }, { status: 404 });
  const { error } = await db.from("fast_errand_catalog_items").update({ image_url: null, image_path: null, updated_at: new Date().toISOString() }).eq("id", item.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await removeStoredObject(db, "marketplace-images", item.image_path).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
