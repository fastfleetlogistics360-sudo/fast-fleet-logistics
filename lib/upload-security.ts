import { randomUUID } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export type UploadProfileName =
  | "avatar"
  | "general-image"
  | "kyc-image"
  | "kyc-document"
  | "delivery-proof"
  | "marketplace-product-image"
  | "business-logo"
  | "admin-banner";

export type UploadRejectionCode =
  | "UPLOAD_EMPTY"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_UNSUPPORTED_TYPE"
  | "UPLOAD_SIGNATURE_MISMATCH"
  | "UPLOAD_UNSAFE_FILENAME"
  | "UPLOAD_INVALID_IMAGE"
  | "UPLOAD_DIMENSIONS_EXCEEDED"
  | "UPLOAD_INVALID_PDF"
  | "UPLOAD_PDF_ENCRYPTED"
  | "UPLOAD_ACTIVE_CONTENT"
  | "UPLOAD_UNAUTHORIZED"
  | "UPLOAD_RATE_LIMITED"
  | "UPLOAD_STORAGE_FAILED";

type UploadProfile = {
  allowedMimeTypes: readonly SupportedMime[];
  maxBytes: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  maxPixels?: number;
  maxOutputWidth?: number;
  maxOutputHeight?: number;
  transformImage: boolean;
  preserveMetadata: boolean;
  allowPdf: boolean;
  allowAnimated: boolean;
  allowSvg: boolean;
};

type SupportedMime = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

export type ValidatedUpload = {
  bytes: Buffer;
  contentType: SupportedMime;
  extension: "jpg" | "png" | "webp" | "pdf";
  fileName: string;
  size: number;
  width?: number;
  height?: number;
  metadataStripped: boolean;
};

export type UploadSecurityLog = {
  route: string;
  userId?: string | null;
  claimedMime?: string | null;
  detectedMime?: string | null;
  fileSize?: number | null;
  code: UploadRejectionCode;
};

const MB = 1024 * 1024;
const MAX_UPLOAD_BYTES = 7 * MB;
const IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const IMAGE_MAX_PIXELS = 25_000_000;

export const UPLOAD_PROFILES: Readonly<Record<UploadProfileName, UploadProfile>> = {
  avatar: imageProfile({ minWidth: 64, minHeight: 64, maxOutputWidth: 1024, maxOutputHeight: 1024 }),
  "general-image": imageProfile({ minWidth: 32, minHeight: 32, maxOutputWidth: 1920, maxOutputHeight: 1920 }),
  "kyc-image": imageProfile({ minWidth: 32, minHeight: 32, transformImage: false, preserveMetadata: true }),
  "kyc-document": {
    ...imageProfile({ minWidth: 32, minHeight: 32, transformImage: false, preserveMetadata: true }),
    allowedMimeTypes: [...IMAGE_MIMES, "application/pdf"],
    allowPdf: true
  },
  "delivery-proof": imageProfile({ minWidth: 64, minHeight: 64, maxOutputWidth: 1920, maxOutputHeight: 1920 }),
  "marketplace-product-image": imageProfile({ minWidth: 64, minHeight: 64, maxOutputWidth: 1800, maxOutputHeight: 1800 }),
  "business-logo": imageProfile({ minWidth: 64, minHeight: 64, maxOutputWidth: 1200, maxOutputHeight: 1200 }),
  "admin-banner": imageProfile({ minWidth: 160, minHeight: 90, maxOutputWidth: 2400, maxOutputHeight: 1600 })
};

const mimeExtensions: Record<SupportedMime, readonly string[]> = {
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
  "application/pdf": ["pdf"]
};

const canonicalExtensions: Record<SupportedMime, ValidatedUpload["extension"]> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf"
};

const dangerousExtensions = new Set([
  "app",
  "asp",
  "aspx",
  "bat",
  "bin",
  "cgi",
  "cmd",
  "com",
  "cpl",
  "dll",
  "dmg",
  "exe",
  "hta",
  "htm",
  "html",
  "jar",
  "js",
  "jsp",
  "mjs",
  "msi",
  "php",
  "pl",
  "ps1",
  "py",
  "rb",
  "scr",
  "sh",
  "svg",
  "svgz",
  "vbs",
  "wasm",
  "xml"
]);

const dangerousPdfMarkers = [
  "/JavaScript",
  "/OpenAction",
  "/Launch",
  "/EmbeddedFile",
  "/RichMedia",
  "/XFA"
];

export class UploadSecurityError extends Error {
  readonly code: UploadRejectionCode;
  readonly status: number;
  readonly detectedMime?: string;

  constructor(
    code: UploadRejectionCode,
    message: string,
    options: { status?: number; detectedMime?: string } = {}
  ) {
    super(message);
    this.name = "UploadSecurityError";
    this.code = code;
    this.status = options.status || statusForCode(code);
    this.detectedMime = options.detectedMime;
  }
}

export async function validateUpload(input: {
  bytes: Buffer | Uint8Array;
  originalName: string;
  declaredMime?: string;
  profile: UploadProfileName;
  requireDeclaredMime?: boolean;
}): Promise<ValidatedUpload> {
  const profile = UPLOAD_PROFILES[input.profile];
  const bytes = Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from(input.bytes);

  if (!bytes.length) throw uploadError("UPLOAD_EMPTY", "The selected file is empty.");
  if (bytes.length > profile.maxBytes) throw uploadError("UPLOAD_TOO_LARGE", "File is too large. Choose a file under 7 MB.");

  const extension = validateOriginalName(input.originalName);
  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(bytes);
  } catch {
    throw uploadError("UPLOAD_UNSUPPORTED_TYPE", "Unsupported or malformed file format.");
  }
  if (!detected || !isSupportedMime(detected.mime)) {
    throw uploadError("UPLOAD_UNSUPPORTED_TYPE", "Unsupported file format. Use JPEG, PNG, WEBP, or PDF where allowed.");
  }

  const detectedMime = detected.mime;
  const declaredMime = normalizeMime(input.declaredMime || "");
  if (input.requireDeclaredMime !== false && (!declaredMime || declaredMime !== detectedMime)) {
    throw new UploadSecurityError("UPLOAD_SIGNATURE_MISMATCH", "File contents do not match its format.", { detectedMime });
  }
  if (!mimeExtensions[detectedMime].includes(extension)) {
    throw new UploadSecurityError("UPLOAD_SIGNATURE_MISMATCH", "File contents do not match its extension.", { detectedMime });
  }
  if (!profile.allowedMimeTypes.includes(detectedMime)) {
    throw new UploadSecurityError(
      "UPLOAD_UNSUPPORTED_TYPE",
      detectedMime === "application/pdf" ? "PDF files are not allowed for this upload." : "Unsupported file format for this upload.",
      { detectedMime }
    );
  }

  if (detectedMime === "application/pdf") {
    if (!profile.allowPdf) throw uploadError("UPLOAD_UNSUPPORTED_TYPE", "PDF files are not allowed for this upload.");
    await validatePdf(bytes);
    return {
      bytes,
      contentType: detectedMime,
      extension: "pdf",
      fileName: `${randomUUID()}.pdf`,
      size: bytes.length,
      metadataStripped: false
    };
  }

  return validateImage(bytes, detectedMime, profile);
}

export function buildStoragePath(input: {
  ownerId: string;
  profile: UploadProfileName;
  fileName: string;
  context?: string;
}) {
  const ownerId = safeServerSegment(input.ownerId, "owner");
  const context = input.context ? safeServerSegment(input.context, "context") : "";
  const fileName = safeGeneratedFileName(input.fileName);
  return [ownerId, input.profile, context, fileName].filter(Boolean).join("/");
}

export function assertOwnedStoragePath(input: {
  path: string;
  ownerId: string;
  profile: UploadProfileName;
  context?: string;
}) {
  const path = normalizeStoragePath(input.path);
  const expectedPrefix = buildStoragePath({
    ownerId: input.ownerId,
    profile: input.profile,
    context: input.context,
    fileName: "00000000-0000-4000-8000-000000000000.jpg"
  })
    .split("/")
    .slice(0, -1)
    .join("/");
  const parts = path.split("/");
  const fileName = parts.at(-1) || "";
  const expectedParts = expectedPrefix.split("/").length + 1;

  if (parts.length !== expectedParts || !path.startsWith(`${expectedPrefix}/`) || !isGeneratedFileName(fileName)) {
    throw new UploadSecurityError("UPLOAD_UNAUTHORIZED", "The uploaded file does not belong to this account.", { status: 403 });
  }
  return path;
}

export function normalizeStoragePath(value: string) {
  const path = String(value || "").trim();
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("..") ||
    /%2e|%2f|%5c/i.test(path) ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw uploadError("UPLOAD_UNSAFE_FILENAME", "The file path is invalid.");
  }
  return path;
}

export function logUploadRejection(input: UploadSecurityLog) {
  console.warn(
    "[upload-security]",
    JSON.stringify({
      event: "upload_rejected",
      code: input.code,
      route: input.route.slice(0, 120),
      userId: input.userId || null,
      claimedMime: normalizeLogValue(input.claimedMime),
      detectedMime: normalizeLogValue(input.detectedMime),
      fileSize: Number.isFinite(input.fileSize) ? Number(input.fileSize) : null,
      timestamp: new Date().toISOString()
    })
  );
}

export function uploadErrorResponse(error: unknown) {
  if (error instanceof UploadSecurityError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  return { status: 500, body: { error: "File upload failed. Please try again.", code: "UPLOAD_STORAGE_FAILED" as const } };
}

export function multipartBodyTooLarge(request: Request, maxFileBytes = MAX_UPLOAD_BYTES) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(contentLength) && contentLength > maxFileBytes + 512 * 1024;
}

function imageProfile(overrides: Partial<UploadProfile> = {}): UploadProfile {
  return {
    allowedMimeTypes: IMAGE_MIMES,
    maxBytes: MAX_UPLOAD_BYTES,
    minWidth: 32,
    minHeight: 32,
    maxWidth: 8192,
    maxHeight: 8192,
    maxPixels: IMAGE_MAX_PIXELS,
    maxOutputWidth: 1920,
    maxOutputHeight: 1920,
    transformImage: true,
    preserveMetadata: false,
    allowPdf: false,
    allowAnimated: false,
    allowSvg: false,
    ...overrides
  };
}

async function validateImage(bytes: Buffer, detectedMime: Exclude<SupportedMime, "application/pdf">, profile: UploadProfile) {
  try {
    const image = sharp(bytes, {
      failOn: "error",
      limitInputPixels: profile.maxPixels || IMAGE_MAX_PIXELS,
      sequentialRead: true,
      animated: false
    });
    const metadata = await image.metadata();
    const width = Number(metadata.width || 0);
    const height = Number(metadata.height || 0);
    const pages = Number(metadata.pages || 1);

    if (!width || !height || (pages > 1 && !profile.allowAnimated)) {
      throw uploadError("UPLOAD_INVALID_IMAGE", pages > 1 ? "Animated images are not allowed." : "The image file is malformed.");
    }
    if (
      width < Number(profile.minWidth || 1) ||
      height < Number(profile.minHeight || 1) ||
      width > Number(profile.maxWidth || width) ||
      height > Number(profile.maxHeight || height) ||
      width * height > Number(profile.maxPixels || IMAGE_MAX_PIXELS)
    ) {
      throw uploadError("UPLOAD_DIMENSIONS_EXCEEDED", "Image dimensions are outside the allowed range.");
    }

    if (!profile.transformImage) {
      await image.stats();
      const extension = canonicalExtensions[detectedMime];
      return {
        bytes,
        contentType: detectedMime,
        extension,
        fileName: `${randomUUID()}.${extension}`,
        size: bytes.length,
        width,
        height,
        metadataStripped: false
      } satisfies ValidatedUpload;
    }

    const output = await image
      .rotate()
      .resize({
        width: profile.maxOutputWidth,
        height: profile.maxOutputHeight,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 84, effort: 4 })
      .toBuffer();

    return {
      bytes: output,
      contentType: "image/webp",
      extension: "webp",
      fileName: `${randomUUID()}.webp`,
      size: output.length,
      width,
      height,
      metadataStripped: !profile.preserveMetadata
    } satisfies ValidatedUpload;
  } catch (error) {
    if (error instanceof UploadSecurityError) throw error;
    throw uploadError("UPLOAD_INVALID_IMAGE", "The image file is malformed or cannot be processed.");
  }
}

async function validatePdf(bytes: Buffer) {
  const text = bytes.toString("latin1");
  const eofIndex = text.lastIndexOf("%%EOF");
  if (!text.startsWith("%PDF-") || eofIndex < 0 || text.slice(eofIndex + 5).trim().length > 0) {
    throw uploadError("UPLOAD_INVALID_PDF", "The PDF file is malformed.");
  }
  if (dangerousPdfMarkers.some((marker) => text.includes(marker)) || /\/JS(?:\s|\[|<|\()/u.test(text)) {
    throw uploadError("UPLOAD_ACTIVE_CONTENT", "PDFs containing active or embedded content are not allowed.");
  }

  try {
    const document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
      throwOnInvalidObject: true
    });
    if (document.isEncrypted) throw uploadError("UPLOAD_PDF_ENCRYPTED", "Encrypted PDFs are not supported.");
    const pageCount = document.getPageCount();
    if (pageCount < 1 || pageCount > 200) throw uploadError("UPLOAD_INVALID_PDF", "The PDF must contain between 1 and 200 pages.");
  } catch (error) {
    if (error instanceof UploadSecurityError) throw error;
    const message = error instanceof Error ? error.message : "";
    if (/encrypted|password/i.test(message)) throw uploadError("UPLOAD_PDF_ENCRYPTED", "Encrypted PDFs are not supported.");
    throw uploadError("UPLOAD_INVALID_PDF", "The PDF file is malformed.");
  }
}

function validateOriginalName(value: string) {
  const name = String(value || "").trim();
  if (
    !name ||
    name === "." ||
    name === ".." ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("..") ||
    /%2e|%2f|%5c/i.test(name) ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    throw uploadError("UPLOAD_UNSAFE_FILENAME", "The original filename is not safe.");
  }

  const parts = name.toLowerCase().split(".");
  if (parts.length < 2 || !parts.at(-1)) throw uploadError("UPLOAD_UNSUPPORTED_TYPE", "The file must have a supported extension.");
  const extension = parts.at(-1) || "";
  if (dangerousExtensions.has(extension)) throw uploadError("UPLOAD_UNSUPPORTED_TYPE", "Unsupported file format.");
  if (parts.slice(1, -1).some((part) => dangerousExtensions.has(part))) {
    throw uploadError("UPLOAD_UNSAFE_FILENAME", "Double-extension filenames are not allowed.");
  }
  return extension;
}

function normalizeMime(value: string) {
  const mime = String(value || "").split(";", 1)[0].trim().toLowerCase();
  if (mime === "image/jpg" || mime === "image/pjpeg") return "image/jpeg";
  return mime;
}

function isSupportedMime(value: string): value is SupportedMime {
  return value in mimeExtensions;
}

function safeServerSegment(value: string, label: string) {
  const segment = String(value || "").trim().toLowerCase();
  if (!segment || !/^[a-z0-9_-]{1,120}$/.test(segment)) {
    throw uploadError("UPLOAD_UNSAFE_FILENAME", `The ${label} storage segment is invalid.`);
  }
  return segment;
}

function safeGeneratedFileName(value: string) {
  if (!isGeneratedFileName(value)) throw uploadError("UPLOAD_UNSAFE_FILENAME", "The generated filename is invalid.");
  return value.toLowerCase();
}

function isGeneratedFileName(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp|pdf)$/i.test(value);
}

function uploadError(code: UploadRejectionCode, message: string) {
  return new UploadSecurityError(code, message);
}

function statusForCode(code: UploadRejectionCode) {
  if (code === "UPLOAD_TOO_LARGE") return 413;
  if (code === "UPLOAD_UNAUTHORIZED") return 403;
  if (code === "UPLOAD_RATE_LIMITED") return 429;
  if (code === "UPLOAD_STORAGE_FAILED") return 500;
  return 400;
}

function normalizeLogValue(value?: string | null) {
  const next = String(value || "").trim().toLowerCase();
  return next ? next.slice(0, 120) : null;
}
