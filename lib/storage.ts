export const IMAGE_UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const KYC_DOCUMENT_UPLOAD_ACCEPT = `${IMAGE_UPLOAD_ACCEPT},.pdf,application/pdf`;
export const BULK_CSV_UPLOAD_ACCEPT = ".csv,text/csv";
const MB = 1024 * 1024;

/**
 * These limits are intentionally cheap to check: do not decode camera images in
 * the browser to inspect or compress them. A high-resolution phone image can
 * exhaust a low-memory browser before a canvas resize begins. The server remains
 * the authority for dimensions, pixel count, MIME verification, and optimization.
 */
export const clientUploadPolicies = {
  profile: { maxBytes: 4 * MB, label: "profile photo" },
  "kyc-image": { maxBytes: 6 * MB, label: "verification photo" },
  "kyc-document": { maxBytes: 7 * MB, label: "verification document" },
  "delivery-proof": { maxBytes: 5 * MB, label: "package photo" },
  "admin-image": { maxBytes: 7 * MB, label: "image" },
  "marketplace-image": { maxBytes: 7 * MB, label: "product image" }
} as const;

export type ClientUploadCategory = keyof typeof clientUploadPolicies;

export async function uploadRiderDocument(
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  validateClientUpload(file, riderDocumentAllowsPdf(documentType) ? "kyc-document" : "kyc-image", { allowPdf: riderDocumentAllowsPdf(documentType) });
  return uploadViaApi("rider-document", file, documentType, onProgress);
}

export async function uploadBusinessDocument(
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  validateClientUpload(file, businessDocumentAllowsPdf(documentType) ? "kyc-document" : "kyc-image", { allowPdf: businessDocumentAllowsPdf(documentType) });
  return uploadViaApi("business-document", file, documentType, onProgress);
}

export async function uploadProfilePhoto(file: File, onProgress?: (progress: number) => void) {
  validateClientUpload(file, "profile");
  const result = await uploadViaApi("profile-photo", file, undefined, onProgress);
  if (!result.publicUrl) throw new Error("Profile picture upload did not return a safe public image URL.");
  return { ...result, publicUrl: result.publicUrl };
}

export async function uploadHeroImage(file: File, onProgress?: (progress: number) => void) {
  validateClientUpload(file, "admin-image");
  const result = await uploadViaApi("hero-image", file, undefined, onProgress);
  if (!result.publicUrl) throw new Error("Admin image upload did not return a safe public image URL.");
  return { ...result, publicUrl: result.publicUrl };
}

export async function uploadMarketplaceImage(file: File, onProgress?: (progress: number) => void) {
  validateClientUpload(file, "marketplace-image");
  const result = await uploadViaApi("marketplace-image", file, undefined, onProgress);
  if (!result.publicUrl) throw new Error("Marketplace image upload did not return a safe public image URL.");
  return { ...result, publicUrl: result.publicUrl };
}

type UploadKind = "profile-photo" | "rider-document" | "business-document" | "hero-image" | "marketplace-image";

async function uploadViaApi(kind: UploadKind, file: File, documentType?: string, onProgress?: (progress: number) => void) {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);
  if (documentType) body.set("documentType", documentType);

  onProgress?.(18);
  let response: Response;
  try {
    response = await fetch("/api/uploads", { method: "POST", body });
  } catch {
    throw new Error("We couldn't upload your file. Check your connection and try again.");
  }
  onProgress?.(82);

  const result = (await response.json().catch(() => null)) as {
    error?: string;
    bucket?: string;
    path?: string;
    publicUrl?: string | null;
    size?: number;
    type?: string;
  } | null;

  if (!response.ok || !result?.path) {
    throw new Error(friendlyUploadError(result?.error));
  }

  onProgress?.(100);
  return {
    bucket: result.bucket,
    path: result.path,
    publicUrl: result.publicUrl || undefined,
    size: result.size || file.size,
    type: result.type || file.type
  };
}

export function friendlyUploadError(message?: string | null) {
  const value = String(message || "").trim();
  if (/too large|under \d+\s*mb/i.test(value)) return value.replace(/^file /i, "This file ");
  if (/jpeg, png, webp|unsupported.*(?:file|format|type)|not supported/i.test(value)) return "This file type isn't supported. Please upload a JPEG, PNG, or WebP image.";
  if (/malformed|cannot be processed|signature|dimensions|pixel|animated/i.test(value)) return "We couldn't process this image. Please choose another photo.";
  if (/network|failed to fetch|connection/i.test(value)) return "We couldn't upload your file. Check your connection and try again.";
  return "Unable to upload this file. Please try a smaller image or try again.";
}

export function validateClientUpload(file: File, category: ClientUploadCategory, options: { allowPdf?: boolean } = {}) {
  const policy = clientUploadPolicies[category];
  const maxBytes = policy.maxBytes;
  const name = file.name.toLowerCase();
  const extension = name.includes(".") ? name.split(".").at(-1) || "" : "";
  const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
  const imageMimes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const declaredMime = file.type.toLowerCase();
  const genericMime = !declaredMime || declaredMime === "application/octet-stream";

  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > maxBytes) throw new Error(`This ${policy.label} is too large. Choose a file smaller than ${Math.ceil(maxBytes / MB)} MB.`);
  if (/\.(?:heic|heif)$/i.test(name) || /image\/(?:heic|heif)/i.test(file.type)) {
    throw new Error("HEIC photos are not supported yet. Choose JPEG, PNG, or WEBP, or set your camera to Most Compatible.");
  }
  if (options.allowPdf && extension === "pdf" && (declaredMime === "application/pdf" || genericMime)) return;
  if (!imageExtensions.has(extension) || (!imageMimes.has(declaredMime) && !genericMime)) {
    throw new Error(options.allowPdf ? "Choose a JPEG, PNG, WEBP, or PDF file." : "Choose a JPEG, PNG, or WEBP image.");
  }
}

function riderDocumentAllowsPdf(documentType: string) {
  return ["vehicle_registration", "insurance_certificate", "guarantor_letter"].includes(documentType);
}

function businessDocumentAllowsPdf(documentType: string) {
  return ["cac_certificate", "address_proof"].includes(documentType);
}
