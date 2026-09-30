import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { buildStoragePath, logUploadRejection, validateUpload, UploadSecurityError, uploadErrorResponse } from "@/lib/upload-security";
import { removeStoredObject, uploadValidatedObject } from "@/lib/secure-storage";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { isUuid } from "@/lib/support/cases";
import { recordSupportEvent } from "@/lib/support/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in to attach evidence." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadIngress);
  if (limited) return limited;

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Evidence uploads are temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });

  try {
    const form = await request.formData();
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Attach between 1 and ${MAX_FILES} files.` }, { status: 400 });
    if (files.some((file) => file.size > MAX_BYTES)) return NextResponse.json({ error: "Each attachment must be 10 MB or smaller." }, { status: 400 });

    const attachments = [] as Array<{ id: string; original_filename: string; content_type: string; byte_size: number; created_at: string }>;
    for (const file of files) {
      const upload = await validateUpload({ bytes: Buffer.from(await file.arrayBuffer()), originalName: file.name, declaredMime: file.type, profile: "support-attachment" });
      const key = buildStoragePath({ ownerId: user.id, profile: "support-attachment", context: id, fileName: upload.fileName });
      const now = new Date().toISOString();
      const { data: attachment, error: insertError } = await db
        .from("support_case_attachments")
        .insert({ ticket_id: id, uploader_user_id: user.id, uploader_type: "customer", visibility: "public", storage_key: key, original_filename: safeName(file.name), content_type: upload.contentType, byte_size: upload.size, status: "pending" })
        .select("id, original_filename, content_type, byte_size, created_at")
        .single();
      if (insertError || !attachment) throw insertError || new Error("Attachment could not be created.");
      try {
        await uploadValidatedObject(db, { bucket: "support-attachments", path: key, upload, publicBucket: false });
        const { error: finalizeError } = await db.from("support_case_attachments").update({ status: "finalized", finalized_at: now }).eq("id", attachment.id).eq("status", "pending");
        if (finalizeError) throw finalizeError;
        attachments.push(attachment);
      } catch (error) {
        await Promise.allSettled([removeStoredObject(db, "support-attachments", key), db.from("support_case_attachments").update({ status: "failed" }).eq("id", attachment.id)]);
        throw error;
      }
    }
    await db.from("support_tickets").update({ last_activity_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
    await recordSupportEvent(db, { ticketId: id, actorUserId: user.id, actorType: "customer", eventType: "EVIDENCE_ATTACHED", metadata: { count: attachments.length } });
    return NextResponse.json({ attachments }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof UploadSecurityError) logUploadRejection({ route: "/api/support/cases/:id/attachments", userId: user.id, code: error.code, detectedMime: error.detectedMime });
    const result = uploadErrorResponse(error);
    return NextResponse.json(result.body, { status: result.status });
  }
}

function safeName(value: string) {
  return String(value || "attachment").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180) || "attachment";
}
