export type VendorOperatingStatus = "open" | "closed";

export function vendorIsOpen(status?: VendorOperatingStatus | null) {
  return status !== "closed";
}

export function vendorStatusLabel(status?: VendorOperatingStatus | null) {
  return vendorIsOpen(status) ? "Open" : "Closed";
}

/** Keeps dense supplier copy readable without altering the source record. */
export function shortVendorDescription(value: string, limit = 150) {
  const description = String(value || "").replace(/\s+/g, " ").trim();
  if (description.length <= limit) return description;

  const sentence = description.slice(0, limit + 1).match(/^(.+?[.!?])(?:\s|$)/)?.[1];
  if (sentence && sentence.length >= 48) return sentence;

  const boundary = description.lastIndexOf(" ", limit - 1);
  return `${description.slice(0, boundary > 48 ? boundary : limit).trim()}…`;
}
