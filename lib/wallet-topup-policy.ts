export const MIN_WALLET_TOP_UP_NGN = 1_000;
export const MAX_WALLET_TOP_UP_NGN = 50_000;
export const DEFAULT_WALLET_TOP_UP_NGN = 10_000;

export type WalletTopUpPolicy = {
  minTopUpNgn: number;
  maxTopUpNgn: number;
};

export const DEFAULT_WALLET_TOP_UP_POLICY: WalletTopUpPolicy = {
  minTopUpNgn: MIN_WALLET_TOP_UP_NGN,
  maxTopUpNgn: MAX_WALLET_TOP_UP_NGN
};

export function normalizeWalletTopUpPolicy(value: unknown): WalletTopUpPolicy {
  const policy = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const minTopUpNgn = clampWholeNumber(policy.min_topup_ngn, MIN_WALLET_TOP_UP_NGN, 1_000_000, MIN_WALLET_TOP_UP_NGN);
  const maxTopUpNgn = clampWholeNumber(policy.max_topup_ngn, minTopUpNgn, 1_000_000, MAX_WALLET_TOP_UP_NGN);
  return { minTopUpNgn, maxTopUpNgn };
}

export function walletTopUpRangeLabel(policy: WalletTopUpPolicy = DEFAULT_WALLET_TOP_UP_POLICY) {
  return `NGN ${policy.minTopUpNgn.toLocaleString("en-NG")} – NGN ${policy.maxTopUpNgn.toLocaleString("en-NG")}`;
}

export function isWalletTopUpAmountAllowed(value: number, policy: WalletTopUpPolicy = DEFAULT_WALLET_TOP_UP_POLICY) {
  return Number.isInteger(value) && value >= policy.minTopUpNgn && value <= policy.maxTopUpNgn;
}

function clampWholeNumber(value: unknown, min: number, max: number, fallback: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return fallback;
  return Math.min(max, Math.max(min, Math.round(amount)));
}
