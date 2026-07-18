import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { UploadSecurityError } from "@/lib/upload-security";

export type StorageQuotaScope = "profile_media" | "rider_kyc" | "business_kyc" | "rider_delivery_proofs" | "admin_media";

type StorageQuotaPolicy = {
  scope: StorageQuotaScope;
  maxBytes: number;
};

const MB = 1024 * 1024;

// Server-only defaults. They are intentionally generous enough for normal KYC
// resubmission while still bounding a compromised account's storage use.
export const storageQuotaPolicies = {
  profileMedia: { scope: "profile_media", maxBytes: 15 * MB },
  riderKyc: { scope: "rider_kyc", maxBytes: 64 * MB },
  businessKyc: { scope: "business_kyc", maxBytes: 96 * MB },
  riderDeliveryProofs: { scope: "rider_delivery_proofs", maxBytes: 64 * MB },
  adminMedia: { scope: "admin_media", maxBytes: 512 * MB }
} as const satisfies Record<string, StorageQuotaPolicy>;

export type StorageQuotaInput = {
  ownerId: string;
  bucket: string;
  path: string;
  scope: StorageQuotaScope;
  bytes: number;
};

type QuotaReservation = {
  reservation_id?: string;
  allowed?: boolean;
};

export async function reserveStorageQuota(db: SupabaseClient, input: StorageQuotaInput) {
  const policy = policyForScope(input.scope);
  const result = await quotaRpc<QuotaReservation>(db, "reserve_storage_quota", {
    next_owner_id: input.ownerId,
    next_scope: input.scope,
    next_quota_bytes: policy.maxBytes,
    next_bytes: input.bytes
  });
  if (!result.data || result.data.allowed !== true || !result.data.reservation_id) {
    logQuotaFailure("quota_denied", input);
    throw new UploadSecurityError("STORAGE_QUOTA_EXCEEDED", "Your secure file storage is full. Remove an older file or contact support.", { status: 429 });
  }
  return result.data.reservation_id;
}

export async function commitStorageQuota(db: SupabaseClient, input: StorageQuotaInput, reservationId: string) {
  const result = await quotaRpc<{ committed?: boolean }>(db, "commit_storage_quota_reservation", {
    next_reservation_id: reservationId,
    next_bucket_id: input.bucket,
    next_object_path: input.path
  });
  if (!result.data?.committed) {
    logQuotaFailure("quota_commit_failed", input);
    throw new UploadSecurityError("UPLOAD_STORAGE_FAILED", "File storage is temporarily unavailable. Please try again.", { status: 503 });
  }
}

export async function releaseStorageQuotaReservation(db: SupabaseClient, reservationId: string) {
  await quotaRpc(db, "release_storage_quota_reservation", { next_reservation_id: reservationId }).catch(() => undefined);
}

export async function releaseStorageQuotaObject(db: SupabaseClient, bucket: string, path: string) {
  await quotaRpc(db, "release_storage_quota_object", { next_bucket_id: bucket, next_object_path: path }).catch(() => undefined);
}

function policyForScope(scope: StorageQuotaScope) {
  const policy = Object.values(storageQuotaPolicies).find((candidate) => candidate.scope === scope);
  if (!policy) throw new UploadSecurityError("UPLOAD_STORAGE_FAILED", "File storage is temporarily unavailable. Please try again.", { status: 503 });
  return policy;
}

async function quotaRpc<T>(db: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const client = db as unknown as {
    rpc: (functionName: string, values: Record<string, unknown>) => Promise<{ data: T | T[] | null; error: { message?: string } | null }>;
  };
  const { data, error } = await client.rpc(fn, args);
  if (error) {
    console.warn("storage_quota_service_error", { operation: fn, timestamp: new Date().toISOString() });
    throw new UploadSecurityError("UPLOAD_STORAGE_FAILED", "File storage is temporarily unavailable. Please try again.", { status: 503 });
  }
  return { data: Array.isArray(data) ? data[0] || null : data };
}

function logQuotaFailure(event: string, input: StorageQuotaInput) {
  console.warn("storage_quota_denied", {
    event,
    scope: input.scope,
    owner_id: input.ownerId,
    bytes: input.bytes,
    timestamp: new Date().toISOString()
  });
}
