import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { validateStoredObjectForAccess } from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/support/cases";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  if (!isUuid(id) || !isUuid(attachmentId)) return unavailable();
  const client = await createClient();
  const [{ data: { user } }, adminContext] = await Promise.all([client.auth.getUser(), requireAdminSession(request)]);
  if (!user && !adminContext) return NextResponse.json({ error: "Sign in to open this attachment." }, { status: 401 });
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadAccess);
  if (limited) return limited;
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Secure attachment access is unavailable." }, { status: 503 });
  const { data } = await db.from("support_case_attachments").select("id, ticket_id, visibility, storage_key, original_filename, content_type, status, support_tickets!inner(user_id)").eq("id", attachmentId).eq("ticket_id", id).eq("status", "finalized").maybeSingle<any>();
  if (!data || (!adminContext && (data.visibility !== "public" || data.support_tickets?.user_id !== user?.id))) return unavailable();
  try {
    const path = await validateStoredObjectForAccess(db, { bucket: "support-attachments", path: data.storage_key, profile: "support-attachment" });
    const signed = await db.storage.from("support-attachments").createSignedUrl(path, 60, { download: safeName(data.original_filename, data.content_type) });
    if (signed.error || !signed.data?.signedUrl) return unavailable();
    const response = NextResponse.redirect(signed.data.signedUrl, 302);
    response.headers.set("Cache-Control", "no-store, private, max-age=0");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch { return unavailable(); }
}

function unavailable() { const response = NextResponse.json({ error: "Attachment unavailable." }, { status: 404 }); response.headers.set("Cache-Control", "no-store, private, max-age=0"); return response; }
function safeName(name: string, type: string) { const stem = String(name || "attachment").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 120) || "attachment"; const ext = type === "application/pdf" ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"; return stem.includes(".") ? stem : `${stem}.${ext}`; }
