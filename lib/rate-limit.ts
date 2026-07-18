import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  category: RateLimitCategory;
  keyStrategy: "authenticated_user_or_ip" | "ip_user_agent";
  authenticatedUserPreferred: boolean;
  anonymousFallback: "ip_user_agent" | "not_allowed";
  adminTreatment: "same_policy" | "admin_standard" | "admin_destructive";
  code: RateLimitCode;
  message?: string;
};

export type RateLimitCategory =
  | "auth_sensitive"
  | "payment"
  | "map_cost"
  | "upload"
  | "secure_access"
  | "delivery_action"
  | "live_location"
  | "withdrawal"
  | "business"
  | "marketplace"
  | "support"
  | "notification"
  | "review"
  | "promotion"
  | "account"
  | "admin"
  | "internal_job";

export type RateLimitCode =
  | "RATE_LIMITED"
  | "RATE_LIMITED_LOCATION"
  | "RATE_LIMITED_WITHDRAWAL"
  | "RATE_LIMITED_SUPPORT"
  | "RATE_LIMITED_BUSINESS_ACTION"
  | "RATE_LIMITED_ADMIN_ACTION"
  | "RATE_LIMITED_AUTH"
  | "RATE_LIMITED_PAYMENT"
  | "MAP_REQUEST_LIMITED";

type RateLimitResult = {
  allowed?: boolean;
  remaining?: number;
  reset_at?: string;
  retry_after_seconds?: number;
};

export const rateLimitPolicies = {
  adminLogin: policy("admin:login", 5, 10 * 60, "auth_sensitive", "ip_user_agent", "RATE_LIMITED_AUTH", "Too many admin login attempts. Try again later."),
  authSensitive: policy("auth:sensitive", 30, 10 * 60, "auth_sensitive", "authenticated_user_or_ip", "RATE_LIMITED_AUTH"),
  accountDelete: policy("account:delete", 3, 24 * 60 * 60, "account", "authenticated_user_or_ip", "RATE_LIMITED"),
  accountProfileMutation: policy("account:profile-mutation", 20, 60 * 60, "account", "authenticated_user_or_ip", "RATE_LIMITED"),
  savedAddressMutation: policy("account:saved-address", 30, 60 * 60, "account", "authenticated_user_or_ip", "RATE_LIMITED"),
  waitlistJoin: policy("account:waitlist-join", 10, 60 * 60, "account", "authenticated_user_or_ip", "RATE_LIMITED"),
  paymentCreate: policy("payment:create", 10, 10 * 60, "payment", "authenticated_user_or_ip", "RATE_LIMITED_PAYMENT"),
  paymentVerify: policy("payment:verify", 30, 5 * 60, "payment", "authenticated_user_or_ip", "RATE_LIMITED_PAYMENT"),
  // Applied only after a valid Squad signature so forged requests cannot use
  // the provider's shared ingress quota.
  paymentWebhook: policy("payment:webhook", 1200, 60, "payment", "ip_user_agent", "RATE_LIMITED_PAYMENT"),
  paymentManualReconcile: policy("payment:manual-reconcile", 10, 10 * 60, "payment", "authenticated_user_or_ip", "RATE_LIMITED_PAYMENT"),
  deliverySettlementRequest: policy("delivery:settlement", 20, 10 * 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED_PAYMENT"),
  estimate: policy("estimate", 60, 5 * 60, "map_cost", "authenticated_user_or_ip", "MAP_REQUEST_LIMITED"),
  mapsAutocomplete: policy("maps:autocomplete", 50, 60, "map_cost", "authenticated_user_or_ip", "MAP_REQUEST_LIMITED"),
  mapsGeocode: policy("maps:geocode", 40, 60, "map_cost", "authenticated_user_or_ip", "MAP_REQUEST_LIMITED"),
  mapsRouteEstimate: policy("maps:route-estimate", 30, 60, "map_cost", "authenticated_user_or_ip", "MAP_REQUEST_LIMITED"),
  accountLookup: policy("payments:account-lookup", 20, 10 * 60, "payment", "authenticated_user_or_ip", "RATE_LIMITED_PAYMENT"),
  riderJobsRead: policy("rider:jobs:read", 120, 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  riderJobsWrite: policy("rider:jobs:write", 25, 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  riderAvailability: policy("rider:availability", 30, 10 * 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  riderDeliveryConfirmation: policy("rider:delivery-confirmation", 10, 5 * 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  customerDeliveryConfirmation: policy("customer:delivery-confirmation", 12, 5 * 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  customerPickupProof: policy("customer:pickup-proof", 20, 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  deliveryConfirmationRead: policy("delivery:confirmation-read", 60, 5 * 60, "delivery_action", "authenticated_user_or_ip", "RATE_LIMITED"),
  liveLocationUpdate: policy("location:live-update", 120, 60, "live_location", "authenticated_user_or_ip", "RATE_LIMITED_LOCATION"),
  withdrawalRequest: policy("wallet:withdrawal-request", 5, 24 * 60 * 60, "withdrawal", "authenticated_user_or_ip", "RATE_LIMITED_WITHDRAWAL"),
  businessRegistration: policy("business:registration", 5, 30 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  businessDispatchCreate: policy("business:dispatch-create", 12, 10 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  businessBulkDispatch: policy("business:bulk-dispatch", 5, 10 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION", "Too many bulk dispatch attempts. Try again later."),
  businessTeamMutation: policy("business:team-mutation", 20, 60 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  businessOrderStatusUpdate: policy("business:order-status-update", 60, 10 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  businessProfileMutation: policy("business:profile-mutation", 20, 60 * 60, "business", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  marketplaceProductWrite: policy("marketplace:product-write", 10, 60 * 60, "marketplace", "authenticated_user_or_ip", "RATE_LIMITED_BUSINESS_ACTION"),
  pushSubscriptionWrite: policy("notifications:push-subscription", 30, 10 * 60, "notification", "authenticated_user_or_ip", "RATE_LIMITED"),
  notificationRead: policy("notifications:read", 120, 5 * 60, "notification", "authenticated_user_or_ip", "RATE_LIMITED"),
  reviewCreate: policy("reviews:create", 10, 60 * 60, "review", "authenticated_user_or_ip", "RATE_LIMITED"),
  promoEnroll: policy("promos:enroll", 10, 60 * 60, "promotion", "authenticated_user_or_ip", "RATE_LIMITED"),
  promoSeen: policy("promos:seen", 60, 60 * 60, "promotion", "authenticated_user_or_ip", "RATE_LIMITED"),
  supportTicketCreate: policy("support:ticket-create", 8, 60 * 60, "support", "authenticated_user_or_ip", "RATE_LIMITED_SUPPORT"),
  supportMessageCreate: policy("support:message-create", 30, 60 * 60, "support", "authenticated_user_or_ip", "RATE_LIMITED_SUPPORT"),
  uploadIngress: policy("upload:ingress", 40, 10 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED", "Too many upload attempts. Try again later."),
  uploadAvatar: policy("upload:avatar", 10, 10 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED", "Too many profile photo uploads. Try again later."),
  uploadKyc: policy("upload:kyc", 20, 10 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED", "Too many document uploads. Try again later."),
  uploadKycSubmit: policy("upload:kyc-submit", 5, 30 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED", "Too many verification submissions. Try again later."),
  uploadAdminMedia: policy("upload:admin-media", 20, 10 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED_ADMIN_ACTION", "Too many media uploads. Try again later."),
  uploadDeliveryProof: policy("upload:delivery-proof", 8, 10 * 60, "upload", "authenticated_user_or_ip", "RATE_LIMITED", "Too many package photo uploads. Try again later."),
  uploadAccess: policy("upload:access", 120, 5 * 60, "secure_access", "authenticated_user_or_ip", "RATE_LIMITED", "Too many file requests. Try again later."),
  adminStandardMutation: policy("admin:standard-mutation", 40, 10 * 60, "admin", "authenticated_user_or_ip", "RATE_LIMITED_ADMIN_ACTION", undefined, "admin_standard"),
  adminDestructiveMutation: policy("admin:destructive-mutation", 12, 10 * 60, "admin", "authenticated_user_or_ip", "RATE_LIMITED_ADMIN_ACTION", undefined, "admin_destructive"),
  cronDailyCommission: policy("cron:daily-commission", 5, 60 * 60, "internal_job", "ip_user_agent", "RATE_LIMITED"),
  safeReadMutation: policy("account:read-mutation", 60, 5 * 60, "account", "authenticated_user_or_ip", "RATE_LIMITED")
} satisfies Record<string, RateLimitPolicy>;

function policy(
  name: string,
  limit: number,
  windowSeconds: number,
  category: RateLimitCategory,
  keyStrategy: RateLimitPolicy["keyStrategy"],
  code: RateLimitCode,
  message?: string,
  adminTreatment: RateLimitPolicy["adminTreatment"] = "same_policy"
): RateLimitPolicy {
  return {
    name,
    limit,
    windowSeconds,
    category,
    keyStrategy,
    authenticatedUserPreferred: keyStrategy === "authenticated_user_or_ip",
    anonymousFallback: keyStrategy === "authenticated_user_or_ip" || keyStrategy === "ip_user_agent" ? "ip_user_agent" : "not_allowed",
    adminTreatment,
    code,
    message
  };
}

export async function enforceRateLimit(request: Request, policy: RateLimitPolicy) {
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Rate limit service is not configured." }, { status: 503 });
  }

  const bucketKey = await rateLimitKey(request);
  const { data, error } = await admin.rpc("consume_rate_limit", {
    next_key: bucketKey,
    next_route: policy.name,
    next_limit: policy.limit,
    next_window_seconds: policy.windowSeconds
  });

  if (error) {
    return NextResponse.json({ error: "Rate limit check failed." }, { status: 503 });
  }

  const result = rateLimitResult(data);
  if (!result.allowed) {
    logRateLimitDenial(policy, result);
    const response = NextResponse.json(
      {
        error: policy.message || "Too many requests. Try again soon.",
        code: policy.code,
        retry_after_seconds: Math.max(1, Number(result.retry_after_seconds || 1))
      },
      { status: 429 }
    );
    applyRateLimitHeaders(response, policy, result);
    return response;
  }

  return null;
}

function applyRateLimitHeaders(response: NextResponse, policy: RateLimitPolicy, result: RateLimitResult) {
  response.headers.set("X-RateLimit-Limit", String(policy.limit));
  response.headers.set("X-RateLimit-Remaining", String(Math.max(0, Number(result.remaining || 0))));
  if (result.reset_at) response.headers.set("X-RateLimit-Reset", result.reset_at);
  if (result.retry_after_seconds) response.headers.set("Retry-After", String(result.retry_after_seconds));
}

async function rateLimitKey(request: Request) {
  const userId = await currentUserId();
  if (userId) return digest(`user:${userId}`);

  const ip = clientIp(request);
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  return digest(`ip:${ip}:ua:${userAgent.slice(0, 120)}`);
}

function logRateLimitDenial(policy: RateLimitPolicy, result: RateLimitResult) {
  console.warn("rate_limit_denied", {
    policy: policy.name,
    category: policy.category,
    code: policy.code,
    retry_after_seconds: Math.max(1, Number(result.retry_after_seconds || 1)),
    reset_at: result.reset_at || null
  });
}

async function currentUserId() {
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();
    return user?.id || "";
  } catch {
    return "";
  }
}

function clientIp(request: Request) {
  const candidates = [
    request.headers.get("x-forwarded-for")?.split(",")[0],
    request.headers.get("x-real-ip"),
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]
  ];
  return candidates.map((value) => value?.trim()).find(Boolean) || "unknown-ip";
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function rateLimitResult(data: unknown): RateLimitResult {
  if (Array.isArray(data)) return (data[0] || {}) as RateLimitResult;
  return (data || {}) as RateLimitResult;
}
