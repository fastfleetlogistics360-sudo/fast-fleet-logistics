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
  userId: string,
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  const compressed = await compressImage(file);
  return uploadViaApi("rider-document", userId, compressed, documentType, onProgress);
}

export async function uploadBusinessDocument(
  userId: string,
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  const compressed = await compressImage(file);
  return uploadViaApi("business-document", userId, compressed, documentType, onProgress);
}

export async function uploadProfilePhoto(userId: string, file: File, onProgress?: (progress: number) => void) {
  const compressed = await compressImage(file, 720, 0.82);
  return uploadViaApi("profile-photo", userId, compressed, undefined, onProgress);
}

export async function uploadHeroImage(file: File, onProgress?: (progress: number) => void) {
  const compressed = await compressImage(file, 1800, 0.82);
  return uploadViaApi("hero-image", "admin", compressed, undefined, onProgress);
}

type UploadKind = "profile-photo" | "rider-document" | "business-document" | "hero-image";

async function uploadViaApi(kind: UploadKind, userId: string, file: File, documentType?: string, onProgress?: (progress: number) => void) {
  const body = new FormData();
  body.set("kind", kind);
  body.set("userId", userId);
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
    publicUrl?: string;
    size?: number;
    type?: string;
  } | null;

  if (!response.ok || !result?.path || !result.publicUrl) {
    throw new Error(result?.error || "Upload failed. Try again.");
  }

  onProgress?.(100);
  return {
    bucket: result.bucket,
    path: result.path,
    publicUrl: result.publicUrl,
    size: result.size || file.size,
    type: result.type || file.type
  };
}
