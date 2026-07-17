import { NextResponse } from "next/server";
import { requireAdminSession } from "@/app/api/admin/_auth";
import { deliveryConfirmationOwnerIds } from "@/lib/delivery-confirmation";
import { pickupProofFromMetadata } from "@/lib/pickup-proof";
import { enforceRateLimit, rateLimitPolicies } from "@/lib/rate-limit";
import { storagePathFromPublicUrl, validateStoredObjectForAccess } from "@/lib/secure-storage";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logUploadRejection, type UploadProfileName } from "@/lib/upload-security";
import {
  businessDocumentProfile,
  isBusinessDocumentType,
  isRiderDocumentType,
  riderDocumentProfile
} from "@/lib/upload-targets";

export const runtime = "nodejs";

type AccessScope = "rider-document" | "business-document" | "delivery-proof";
type AccessTarget = {
  bucket: "rider-documents" | "business-documents" | "delivery-proofs" | "profile-photos";
  path: string;
  profile: UploadProfileName;
  downloadName: string | null;
};

export async function GET(request: Request) {
  const limited = await enforceRateLimit(request, rateLimitPolicies.uploadAccess);
  if (limited) return limited;

  const url = new URL(request.url);
  const scope = String(url.searchParams.get("scope") || "") as AccessScope;
  const id = String(url.searchParams.get("id") || "").trim();
  if (!isAccessScope(scope) || !isUuid(id)) return unavailable();

  const supabase = await createClient();
  const [{ data: authData }, adminContext] = await Promise.all([
    supabase.auth.getUser(),
    requireAdminSession(request)
  ]);
  const userId = authData.user?.id || null;
  if (!userId && !adminContext) {
    logUploadRejection({ route: "/api/uploads/access", code: "UPLOAD_UNAUTHORIZED" });
    return NextResponse.json({ error: "Sign in to open this file.", code: "UPLOAD_UNAUTHORIZED" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Secure file access is not configured." }, { status: 503 });

  try {
    const target =
      scope === "business-document"
        ? await businessDocumentTarget(admin, id, userId, Boolean(adminContext))
        : scope === "rider-document"
          ? await riderDocumentTarget(admin, id, userId, Boolean(adminContext))
          : await deliveryProofTarget(admin, id, userId, Boolean(adminContext));
    if (!target) throw new Error("unavailable");

    const path = await validateStoredObjectForAccess(admin, target);
    const options = target.downloadName ? { download: target.downloadName } : undefined;
    const signed = await admin.storage.from(target.bucket).createSignedUrl(path, 60, options);
    if (signed.error || !signed.data?.signedUrl) throw new Error("unavailable");

    const response = NextResponse.redirect(signed.data.signedUrl, 302);
    response.headers.set("Cache-Control", "no-store, private, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  } catch {
    logUploadRejection({ route: "/api/uploads/access", userId, code: "UPLOAD_UNAUTHORIZED" });
    return unavailable();
  }
}

async function businessDocumentTarget(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  userId: string | null,
  isAdmin: boolean
): Promise<AccessTarget | null> {
  const { data } = await db
    .from("business_documents")
    .select("storage_path, document_type, user_id")
    .eq("id", id)
    .maybeSingle<{ storage_path?: string | null; document_type?: string | null; user_id?: string | null }>();
  if (!data?.storage_path || !isBusinessDocumentType(String(data.document_type || "")) || (!isAdmin && data.user_id !== userId)) return null;
  return {
    bucket: "business-documents" as const,
    path: data.storage_path,
    profile: businessDocumentProfile(data.document_type as Parameters<typeof businessDocumentProfile>[0]),
    downloadName: safeDownloadName(data.document_type, data.storage_path)
  };
}

async function riderDocumentTarget(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  userId: string | null,
  isAdmin: boolean
): Promise<AccessTarget | null> {
  const { data: document } = await db
    .from("rider_documents")
    .select("storage_path, document_type, rider_profile_id")
    .eq("id", id)
    .maybeSingle<{ storage_path?: string | null; document_type?: string | null; rider_profile_id?: string | null }>();
  if (!document?.storage_path || !document.rider_profile_id) return null;
  const { data: rider } = await db
    .from("rider_profiles")
    .select("user_id")
    .eq("id", document.rider_profile_id)
    .maybeSingle<{ user_id?: string | null }>();
  if (!isAdmin && rider?.user_id !== userId) return null;
  const documentType = String(document.document_type || "");
  const isProfilePhoto = documentType === "profile_photo";
  const legacyImageType = documentType === "nin" || documentType === "license" || documentType === "selfie";
  if (!isProfilePhoto && !legacyImageType && !isRiderDocumentType(documentType)) return null;
  const bucket = isProfilePhoto ? "profile-photos" as const : "rider-documents" as const;
  return {
    bucket,
    path: document.storage_path,
    profile: isProfilePhoto ? "avatar" : legacyImageType ? "kyc-image" : riderDocumentProfile(documentType as Parameters<typeof riderDocumentProfile>[0]),
    downloadName: safeDownloadName(document.document_type, document.storage_path)
  };
}

async function deliveryProofTarget(
  db: NonNullable<ReturnType<typeof createAdminClient>>,
  id: string,
  userId: string | null,
  isAdmin: boolean
): Promise<AccessTarget | null> {
  const { data: delivery } = await db
    .from("deliveries")
    .select("id, customer_id, rider_id, metadata")
    .eq("id", id)
    .maybeSingle<{ id: string; customer_id?: string | null; rider_id?: string | null; metadata?: Record<string, unknown> | null }>();
  if (!delivery?.id) return null;

  const { data: rider } = delivery.rider_id
    ? await db.from("rider_profiles").select("user_id").eq("id", delivery.rider_id).maybeSingle<{ user_id?: string | null }>()
    : { data: null };
  const participantIds = new Set([...deliveryConfirmationOwnerIds(delivery), rider?.user_id].filter(Boolean));
  if (!isAdmin && (!userId || !participantIds.has(userId))) return null;

  const proof = pickupProofFromMetadata(delivery.metadata);
  const path = proof?.path || storagePathFromPublicUrl(proof?.url, "delivery-proofs");
  if (!path) return null;
  return { bucket: "delivery-proofs", path, profile: "delivery-proof", downloadName: null };
}

function unavailable() {
  const response = NextResponse.json({ error: "File unavailable." }, { status: 404 });
  response.headers.set("Cache-Control", "no-store, private, max-age=0");
  return response;
}

function safeDownloadName(documentType?: string | null, path?: string | null) {
  const label = String(documentType || "document").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60) || "document";
  const extension = String(path || "").split(".").at(-1)?.toLowerCase();
  return `${label}.${new Set(["jpg", "jpeg", "png", "webp", "pdf"]).has(extension || "") ? extension : "bin"}`;
}

function isAccessScope(value: string): value is AccessScope {
  return value === "rider-document" || value === "business-document" || value === "delivery-proof";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
