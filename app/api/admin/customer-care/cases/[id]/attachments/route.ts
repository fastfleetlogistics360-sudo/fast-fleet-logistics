import { NextResponse } from "next/server";
import { enforceAdminMutationRateLimit, requireAdminSession } from "@/app/api/admin/_auth";
import { removeStoredObject, uploadValidatedObject } from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildStoragePath, validateUpload } from "@/lib/upload-security";
import { isUuid } from "@/lib/support/cases";
import { recordSupportEvent } from "@/lib/support/events";

export const runtime = "nodejs";
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  const admin = await requireAdminSession(request);
  if (!admin) return NextResponse.json({ error: "Admin session required." }, { status: 401 });
  const limited = await enforceAdminMutationRateLimit(request);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Evidence uploads are temporarily unavailable." }, { status: 503 });
  const { data: supportCase } = await db.from("support_tickets").select("id").eq("id", id).maybeSingle();
  if (!supportCase) return NextResponse.json({ error: "Support case not found." }, { status: 404 });
  try {
    const form = await request.formData();
    const visibility = form.get("visibility") === "internal" ? "internal" : "public";
    const files = form.getAll("files").filter((value): value is File => value instanceof File);
    if (!files.length || files.length > MAX_FILES) return NextResponse.json({ error: `Attach between 1 and ${MAX_FILES} files.` }, { status: 400 });
    if (files.some((file) => file.size > MAX_BYTES)) return NextResponse.json({ error: "Each attachment must be 10 MB or smaller." }, { status: 400 });
    const attachments = [] as Array<{ id: string; original_filename: string; visibility: string }>;
    for (const file of files) {
      const upload = await validateUpload({ bytes: Buffer.from(await file.arrayBuffer()), originalName: file.name, declaredMime: file.type, profile: "support-attachment" });
      const key = buildStoragePath({ ownerId: admin.userId, profile: "support-attachment", context: id, fileName: upload.fileName });
      const { data: attachment, error } = await db.from("support_case_attachments").insert({ ticket_id: id, uploader_user_id: admin.userId, uploader_type: "agent", visibility, storage_key: key, original_filename: safeName(file.name), content_type: upload.contentType, byte_size: upload.size, status: "pending" }).select("id, original_filename, visibility").single();
      if (error || !attachment) throw error || new Error("Attachment could not be created.");
      try {
        await uploadValidatedObject(db, { bucket: "support-attachments", path: key, upload, publicBucket: false });
        const { error: finalizeError } = await db.from("support_case_attachments").update({ status: "finalized", finalized_at: new Date().toISOString() }).eq("id", attachment.id).eq("status", "pending");
        if (finalizeError) throw finalizeError;
        attachments.push(attachment);
      } catch (uploadError) {
        await Promise.allSettled([removeStoredObject(db, "support-attachments", key), db.from("support_case_attachments").update({ status: "failed" }).eq("id", attachment.id)]);
        throw uploadError;
      }
    }
    await db.from("support_tickets").update({ last_activity_at: new Date().toISOString() }).eq("id", id);
    await recordSupportEvent(db, { ticketId: id, actorUserId: admin.userId, actorType: "agent", eventType: "EVIDENCE_ATTACHED", metadata: { count: attachments.length, visibility } });
    return NextResponse.json({ attachments }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Could not attach evidence. Please try again." }, { status: 503 }); }
}

function safeName(value: string) { return String(value || "attachment").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 180) || "attachment"; }
