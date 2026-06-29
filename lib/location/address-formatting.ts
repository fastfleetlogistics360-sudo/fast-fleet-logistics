const currentLocationQualifierPattern = /\bnear\s+your\s+current\s+location\b/gi;
const currentDetectedAddressPattern = /\bcurrent\s+detected\s+address\b/gi;

export function sanitizeAddressText(value: string) {
  const normalized = value
    .trim()
    .replace(currentLocationQualifierPattern, "")
    .replace(currentDetectedAddressPattern, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/^[,\s]+|[,\s]+$/g, "");

  return dedupeAddressSegments(normalized);
}

export function isUsableAddressText(value: string) {
  return sanitizeAddressText(value).length >= 4;
}

function dedupeAddressSegments(value: string) {
  const seen = new Set<string>();
  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .filter((segment) => {
      const key = segment.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return segments.join(", ");
}
