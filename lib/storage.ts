export const IMAGE_UPLOAD_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const KYC_DOCUMENT_UPLOAD_ACCEPT = `${IMAGE_UPLOAD_ACCEPT},.pdf,application/pdf`;
export const BULK_CSV_UPLOAD_ACCEPT = ".csv,text/csv";
export const MAX_UPLOAD_BYTES = 7 * 1024 * 1024;

export async function compressImage(file: File, maxSize = 1280, quality = 0.78): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!blob) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), {
      type: "image/jpeg",
      lastModified: Date.now()
    });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}

export async function uploadRiderDocument(
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  validateClientFile(file, { allowPdf: riderDocumentAllowsPdf(documentType) });
  return uploadViaApi("rider-document", file, documentType, onProgress);
}

export async function uploadBusinessDocument(
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  validateClientFile(file, { allowPdf: businessDocumentAllowsPdf(documentType) });
  return uploadViaApi("business-document", file, documentType, onProgress);
}

export async function uploadProfilePhoto(file: File, onProgress?: (progress: number) => void) {
  validateClientFile(file);
  const compressed = await compressImage(file, 720, 0.82);
  const result = await uploadViaApi("profile-photo", compressed, undefined, onProgress);
  if (!result.publicUrl) throw new Error("Profile picture upload did not return a safe public image URL.");
  return { ...result, publicUrl: result.publicUrl };
}

export async function uploadHeroImage(file: File, onProgress?: (progress: number) => void) {
  validateClientFile(file);
  const compressed = await compressImage(file, 1800, 0.82);
  const result = await uploadViaApi("hero-image", compressed, undefined, onProgress);
  if (!result.publicUrl) throw new Error("Admin image upload did not return a safe public image URL.");
  return { ...result, publicUrl: result.publicUrl };
}

type UploadKind = "profile-photo" | "rider-document" | "business-document" | "hero-image";

async function uploadViaApi(kind: UploadKind, file: File, documentType?: string, onProgress?: (progress: number) => void) {
  const body = new FormData();
  body.set("kind", kind);
  body.set("file", file);
  if (documentType) body.set("documentType", documentType);

  onProgress?.(18);
  const response = await fetch("/api/uploads", {
    method: "POST",
    body
  });
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
    throw new Error(result?.error || "Upload failed. Try again.");
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

export function validateClientFile(file: File, options: { allowPdf?: boolean; maxBytes?: number } = {}) {
  const maxBytes = options.maxBytes || MAX_UPLOAD_BYTES;
  const name = file.name.toLowerCase();
  const extension = name.includes(".") ? name.split(".").at(-1) || "" : "";
  const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
  const imageMimes = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
  const declaredMime = file.type.toLowerCase();
  const genericMime = !declaredMime || declaredMime === "application/octet-stream";

  if (!file.size) throw new Error("The selected file is empty.");
  if (file.size > maxBytes) throw new Error(`File is too large. Choose a file under ${Math.ceil(maxBytes / 1024 / 1024)} MB.`);
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
