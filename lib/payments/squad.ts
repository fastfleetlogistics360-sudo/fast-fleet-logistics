export type SquadPaymentChannel = "card" | "bank" | "ussd" | "transfer";

export type SquadTransaction = {
  amountNgn: number;
  reference: string;
  status: string;
  currency: string;
  channel: string;
  paidAt: string;
  gatewayReference: string | null;
  raw: Record<string, unknown>;
};

type SquadInitiateInput = {
  amountNgn: number;
  email: string;
  reference: string;
  callbackUrl: string;
  customerName?: string | null;
  channels?: SquadPaymentChannel[];
  metadata?: Record<string, unknown>;
  passCharge?: boolean;
};

type SquadApiPayload = {
  status?: number | string;
  success?: boolean;
  message?: string;
  data?: Record<string, unknown> | null;
};

const SQUAD_SANDBOX_BASE_URL = "https://sandbox-api-d.squadco.com";
const SQUAD_PRODUCTION_BASE_URL = "https://api-d.squadco.com";
const pendingStatuses = new Set(["pending"]);

export class SquadApiError extends Error {
  status: number;
  payload: SquadApiPayload | null;

  constructor(message: string, status: number, payload: SquadApiPayload | null = null) {
    super(message);
    this.name = "SquadApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getSquadSecretKey() {
  return process.env.SQUAD_SECRET_KEY?.trim() || "";
}

export function getSquadBaseUrl() {
  const explicit = process.env.SQUAD_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const key = getSquadSecretKey();
  return key.startsWith("sandbox_") ? SQUAD_SANDBOX_BASE_URL : SQUAD_PRODUCTION_BASE_URL;
}

export function assertSquadConfigured() {
  const secretKey = getSquadSecretKey();
  if (!secretKey) {
    throw new SquadApiError("Missing SQUAD_SECRET_KEY. Add your Squad secret key before accepting payments.", 500);
  }
  return secretKey;
}

export function generatePaymentReference(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

export function paymentChannelsFor(method: string): SquadPaymentChannel[] {
  return method === "transfer" ? ["transfer"] : ["card"];
}

export function isPendingSquadStatus(status: string) {
  return pendingStatuses.has(status.toLowerCase());
}

export function isSuccessfulSquadStatus(status: string) {
  const normalized = status.toLowerCase();
  return normalized === "success" || normalized === "successful";
}

export async function initiateSquadPayment(input: SquadInitiateInput) {
  const secretKey = assertSquadConfigured();
  const payload = await squadFetch("/transaction/initiate", {
    method: "POST",
    secretKey,
    body: {
      amount: toMinorAmount(input.amountNgn),
      email: input.email,
      currency: "NGN",
      initiate_type: "inline",
      transaction_ref: input.reference,
      callback_url: input.callbackUrl,
      customer_name: input.customerName || input.email,
      payment_channels: input.channels?.length ? input.channels : ["card", "transfer", "ussd", "bank"],
      metadata: input.metadata || {},
      pass_charge: Boolean(input.passCharge)
    }
  });

  const data = payload.data || {};
  const checkoutUrl = text(data.checkout_url || data.auth_url);
  if (!checkoutUrl) {
    throw new SquadApiError(payload.message || "Squad did not return a checkout URL.", 502, payload);
  }

  return {
    reference: text(data.transaction_ref) || input.reference,
    authorizationUrl: checkoutUrl,
    accessCode: text(data.access_token) || null,
    raw: data
  };
}

export async function verifySquadTransaction(reference: string): Promise<SquadTransaction> {
  const secretKey = assertSquadConfigured();
  const payload = await squadFetch(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    secretKey
  });
  const data = payload.data || {};
  const status = text(data.transaction_status || data.status || "Pending");

  return {
    amountNgn: fromMinorAmount(data.transaction_amount),
    reference: text(data.transaction_ref) || reference,
    status,
    currency: text(data.transaction_currency_id || data.currency || "NGN"),
    channel: text(data.transaction_type || data.payment_type || "squad"),
    paidAt: text(data.created_at) || new Date().toISOString(),
    gatewayReference: text(data.gateway_transaction_ref || data.gateway_ref) || null,
    raw: data
  };
}

export async function resolveSquadAccount(bankCode: string, accountNumber: string) {
  const secretKey = assertSquadConfigured();
  const payload = await squadFetch("/payout/account/lookup", {
    method: "POST",
    secretKey,
    body: {
      bank_code: bankCode,
      account_number: accountNumber
    }
  });
  const data = payload.data || {};
  return {
    accountName: text(data.account_name),
    accountNumber: text(data.account_number) || accountNumber
  };
}

export async function checkSquadKey() {
  const secretKey = assertSquadConfigured();
  const response = await fetch(`${getSquadBaseUrl()}/transaction/verify/fastfleet-readiness-probe`, {
    headers: squadHeaders(secretKey),
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as SquadApiPayload | null;

  if (response.status === 401 || response.status === 403) {
    throw new SquadApiError(payload?.message || `Squad returned ${response.status}`, response.status, payload);
  }

  return {
    ok: true,
    status: response.status,
    message: response.ok
      ? "Squad API accepted the key"
      : `Squad API reached with configured key; probe returned ${response.status} for a fake reference.`
  };
}

async function squadFetch(path: string, options: { method: "GET" | "POST"; secretKey: string; body?: Record<string, unknown> }) {
  const response = await fetch(`${getSquadBaseUrl()}${path}`, {
    method: options.method,
    headers: squadHeaders(options.secretKey),
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store"
  });
  const payload = (await response.json().catch(() => null)) as SquadApiPayload | null;

  if (!response.ok || !payload || payload.success === false) {
    throw new SquadApiError(payload?.message || `Squad returned ${response.status}`, response.status, payload);
  }

  return payload;
}

function squadHeaders(secretKey: string) {
  return {
    Authorization: `Bearer ${secretKey}`,
    "Content-Type": "application/json"
  };
}

function toMinorAmount(amountNgn: number) {
  return Math.round(Number(amountNgn || 0) * 100);
}

function fromMinorAmount(value: unknown) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount / 100 : 0;
}

function text(value: unknown) {
  return String(value || "").trim();
}

export const squadBanks = [
  { name: "Access Bank", code: "000014" },
  { name: "Ecobank Bank", code: "000010" },
  { name: "Fidelity Bank", code: "000007" },
  { name: "First Bank of Nigeria", code: "000016" },
  { name: "FCMB", code: "000003" },
  { name: "Globus Bank", code: "000027" },
  { name: "GTBank Plc", code: "000013" },
  { name: "Heritage Bank", code: "000020" },
  { name: "JAIZ Bank", code: "000006" },
  { name: "Keystone Bank", code: "000002" },
  { name: "Kuda Microfinance Bank", code: "090267" },
  { name: "Lotus Bank", code: "000029" },
  { name: "Moniepoint MFB", code: "090405" },
  { name: "Opay", code: "100004" },
  { name: "PalmPay", code: "100033" },
  { name: "Polaris Bank", code: "000008" },
  { name: "Premium Trust Bank", code: "000031" },
  { name: "Providus Bank", code: "000023" },
  { name: "Stanbic IBTC Bank", code: "000012" },
  { name: "Sterling Bank", code: "000001" },
  { name: "Suntrust Bank", code: "000022" },
  { name: "Taj Bank", code: "000026" },
  { name: "Titan Trust Bank", code: "000025" },
  { name: "Union Bank", code: "000018" },
  { name: "United Bank for Africa", code: "000004" },
  { name: "Unity Bank", code: "000011" },
  { name: "Wema Bank", code: "000017" },
  { name: "Zenith Bank Plc", code: "000015" }
];
