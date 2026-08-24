export function normalizeWhatsAppPhone(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `234${digits.slice(1)}`;
  return digits;
}

export function isPlausibleWhatsAppPhone(value: string | null | undefined) {
  const normalized = normalizeWhatsAppPhone(value);
  return normalized.length >= 8 && normalized.length <= 16;
}

