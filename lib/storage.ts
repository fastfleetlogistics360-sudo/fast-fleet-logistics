import { createClient } from "@/lib/supabase/client";

export async function compressImage(file: File, maxSize = 1280, quality = 0.78): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  const bitmap = await createImageBitmap(file);
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
}

export async function uploadRiderDocument(
  userId: string,
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  const supabase = createClient();
  const compressed = await compressImage(file);
  const safeName = compressed.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${userId}/${documentType}/${Date.now()}-${safeName}`;

  onProgress?.(18);
  const upload = await supabase.storage.from("rider-documents").upload(path, compressed, {
    cacheControl: "3600",
    upsert: true
  });
  onProgress?.(82);

  if (upload.error) throw upload.error;

  const { data } = supabase.storage.from("rider-documents").getPublicUrl(path);
  onProgress?.(100);

  return {
    path,
    publicUrl: data.publicUrl,
    size: compressed.size,
    type: compressed.type
  };
}

export async function uploadBusinessDocument(
  userId: string,
  documentType: string,
  file: File,
  onProgress?: (progress: number) => void
) {
  const supabase = createClient();
  const compressed = await compressImage(file);
  const safeName = compressed.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${userId}/${documentType}/${Date.now()}-${safeName}`;

  onProgress?.(18);
  const upload = await supabase.storage.from("business-documents").upload(path, compressed, {
    cacheControl: "3600",
    upsert: true
  });
  onProgress?.(82);

  if (upload.error) throw upload.error;

  const { data } = supabase.storage.from("business-documents").getPublicUrl(path);
  onProgress?.(100);

  return {
    path,
    publicUrl: data.publicUrl,
    size: compressed.size,
    type: compressed.type
  };
}

export async function uploadProfilePhoto(userId: string, file: File, onProgress?: (progress: number) => void) {
  const supabase = createClient();
  const compressed = await compressImage(file, 720, 0.82);
  const safeName = compressed.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${userId}/${Date.now()}-${safeName}`;

  onProgress?.(18);
  const upload = await supabase.storage.from("profile-photos").upload(path, compressed, {
    cacheControl: "3600",
    upsert: true
  });
  onProgress?.(82);

  if (upload.error) throw upload.error;

  const { data } = supabase.storage.from("profile-photos").getPublicUrl(path);
  onProgress?.(100);

  return {
    path,
    publicUrl: data.publicUrl,
    size: compressed.size,
    type: compressed.type
  };
}
