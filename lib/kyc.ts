import type { RiderApplicationStatus } from "@/types/domain";

export type WalletKycStatus = "pending" | "verified" | "more_info_needed";

export function walletKycStatus(status?: RiderApplicationStatus | string | null): WalletKycStatus {
  if (status === "approved") return "verified";
  if (status === "more_info_required" || status === "rejected") return "more_info_needed";
  return "pending";
}

export function walletKycLabel(status: WalletKycStatus) {
  if (status === "verified") return "Verified";
  if (status === "more_info_needed") return "More info needed";
  return "Pending";
}

export function riderReviewLabel(status?: RiderApplicationStatus | string | null) {
  return walletKycLabel(walletKycStatus(status));
}
