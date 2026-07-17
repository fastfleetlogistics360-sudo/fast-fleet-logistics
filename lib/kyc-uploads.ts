import type { SupabaseClient } from "@supabase/supabase-js";
import { UploadSecurityError } from "@/lib/upload-security";
import { verifyOwnedStoredUpload } from "@/lib/secure-storage";
import {
  businessDocumentProfile,
  businessDocumentTypes,
  isBusinessDocumentType,
  isRiderDocumentType,
  riderDocumentProfile,
  riderDocumentTypes,
  type BusinessDocumentType,
  type RiderDocumentType
} from "@/lib/upload-targets";

export type SubmittedUpload = {
  key: string;
  path?: string;
};

export type VerifiedKycUpload = {
  key: RiderDocumentType | BusinessDocumentType | "profile_photo";
  path: string;
  bucket: "profile-photos" | "rider-documents" | "business-documents";
  contentType: string;
  size: number;
  publicUrl: string | null;
};

export async function verifyRiderKycUploads(
  db: SupabaseClient,
  input: { userId: string; governmentIdType: string; documents: SubmittedUpload[] }
) {
  const required = new Set<string>(["profile_photo", "government_id", "vehicle_registration", "vehicle_papers"]);
  if (input.governmentIdType !== "drivers_licence") required.add("drivers_licence");
  const documents = uniqueDocuments(input.documents, new Set(["profile_photo", ...riderDocumentTypes]));
  ensureRequiredDocuments(required, documents);

  return Promise.all(
    documents.map(async (document) => {
      if (document.key === "profile_photo") {
        const verified = await verifyOwnedStoredUpload(db, {
          bucket: "profile-photos",
          path: document.path,
          ownerId: input.userId,
          profile: "avatar",
          context: "profile"
        });
        return {
          key: "profile_photo" as const,
          path: verified.path,
          bucket: "profile-photos" as const,
          contentType: verified.upload.contentType,
          size: verified.upload.size,
          publicUrl: db.storage.from("profile-photos").getPublicUrl(verified.path).data.publicUrl
        };
      }

      if (!isRiderDocumentType(document.key)) throw unauthorizedDocument();
      const verified = await verifyOwnedStoredUpload(db, {
        bucket: "rider-documents",
        path: document.path,
        ownerId: input.userId,
        profile: riderDocumentProfile(document.key),
        context: document.key
      });
      return {
        key: document.key,
        path: verified.path,
        bucket: "rider-documents" as const,
        contentType: verified.upload.contentType,
        size: verified.upload.size,
        publicUrl: null
      };
    })
  );
}

export async function verifyBusinessKycUploads(
  db: SupabaseClient,
  input: { userId: string; documents: SubmittedUpload[] }
) {
  const required = new Set<string>(["storefront_photo", "cac_certificate", "address_proof"]);
  const documents = uniqueDocuments(input.documents, new Set(businessDocumentTypes));
  ensureRequiredDocuments(required, documents);

  return Promise.all(
    documents.map(async (document) => {
      if (!isBusinessDocumentType(document.key)) throw unauthorizedDocument();
      const verified = await verifyOwnedStoredUpload(db, {
        bucket: "business-documents",
        path: document.path,
        ownerId: input.userId,
        profile: businessDocumentProfile(document.key),
        context: document.key
      });
      return {
        key: document.key,
        path: verified.path,
        bucket: "business-documents" as const,
        contentType: verified.upload.contentType,
        size: verified.upload.size,
        publicUrl: null
      };
    })
  );
}

function uniqueDocuments(documents: SubmittedUpload[], allowed: Set<string>) {
  const output: Array<{ key: string; path: string }> = [];
  const seen = new Set<string>();
  for (const document of documents) {
    const key = String(document.key || "").trim();
    const path = String(document.path || "").trim();
    if (!allowed.has(key) || !path || seen.has(key)) {
      if (seen.has(key)) throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Only one file may be submitted for each document type.", { status: 400 });
      continue;
    }
    seen.add(key);
    output.push({ key, path });
  }
  return output;
}

function ensureRequiredDocuments(required: Set<string>, documents: Array<{ key: string }>) {
  const submitted = new Set(documents.map((document) => document.key));
  if (Array.from(required).some((key) => !submitted.has(key))) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "Upload every required verification document before submitting.", { status: 400 });
  }
}

function unauthorizedDocument() {
  return new UploadSecurityError("UPLOAD_UNAUTHORIZED", "A submitted document type is not permitted.", { status: 403 });
}
