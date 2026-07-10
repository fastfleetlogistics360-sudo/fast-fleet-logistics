export const PICKUP_PROOF_REVIEW_WINDOW_MS = 3 * 60 * 1000;
export const PICKUP_PROOF_MAX_REJECTIONS = 2;

export type PickupProofStatus = "pending" | "approved" | "rejected" | "auto_approved";

export type PickupProof = {
  url?: string | null;
  path?: string | null;
  bucket?: string | null;
  status?: PickupProofStatus | null;
  uploaded_at?: string | null;
  expires_at?: string | null;
  reviewed_at?: string | null;
  approved_by?: string | null;
  rejected_by?: string | null;
  rejection_count?: number | null;
  can_continue?: boolean | null;
  flagged_at?: string | null;
  attempt?: number | null;
  note?: string | null;
  history?: Array<Record<string, unknown>>;
};

export function metadataRecord(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? { ...(metadata as Record<string, unknown>) } : {};
}

export function pickupProofFromMetadata(metadata: unknown): PickupProof | null {
  const proof = metadataRecord(metadata).pickup_proof;
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return null;
  return proof as PickupProof;
}

export function isCustomerPickupProofRequired(metadata: unknown) {
  const record = metadataRecord(metadata);
  if (record.pickup_proof_required === true) return true;
  if (record.pickup_proof_required === false) return false;
  const source = String(record.source || "").toLowerCase();
  if (source.includes("business") || source.includes("marketplace")) return false;
  return source === "booking_checkout" || source === "customer_booking";
}

export function pickupProofReviewExpired(proof: PickupProof | null | undefined, now = Date.now()) {
  if (proof?.status !== "pending" || !proof.expires_at) return false;
  const expiresAt = new Date(proof.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

export function pickupProofCanStartTrip(metadata: unknown, now = Date.now()) {
  if (!isCustomerPickupProofRequired(metadata)) return true;
  const proof = pickupProofFromMetadata(metadata);
  if (!proof?.url) return false;
  if (proof.status === "approved" || proof.status === "auto_approved") return true;
  if (proof.status === "rejected" && proof.can_continue) return true;
  if (pickupProofReviewExpired(proof, now)) return true;
  return false;
}

export function pickupProofNeedsUpload(metadata: unknown) {
  if (!isCustomerPickupProofRequired(metadata)) return false;
  const proof = pickupProofFromMetadata(metadata);
  if (!proof?.url) return true;
  return proof.status === "rejected" && !proof.can_continue;
}

export function pickupProofRejectionCount(proof: PickupProof | null | undefined) {
  return Math.max(0, Number(proof?.rejection_count || 0));
}

export function pickupProofStatusMessage(proof: PickupProof | null | undefined) {
  if (!proof?.url) return "Waiting for the rider to upload the package photo.";
  if (proof.status === "approved") return "Customer confirmed this package.";
  if (proof.status === "auto_approved") return "Review window ended. The rider can continue.";
  if (proof.status === "rejected" && proof.can_continue) return "Customer disputed this package twice. Support has been flagged and the rider can continue if the pickup is correct.";
  if (proof.status === "rejected") return "Customer said this is not the right package. Rider must upload a new photo.";
  if (pickupProofReviewExpired(proof)) return "Review window ended. The rider can continue.";
  return "Waiting for customer confirmation.";
}

export function pickupProofReviewSecondsRemaining(proof: PickupProof | null | undefined, now = Date.now()) {
  if (proof?.status !== "pending" || !proof.expires_at) return 0;
  const expiresAt = new Date(proof.expires_at).getTime();
  if (!Number.isFinite(expiresAt)) return 0;
  return Math.max(0, Math.ceil((expiresAt - now) / 1000));
}
