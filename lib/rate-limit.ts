import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
  message?: string;
};

type RateLimitResult = {
  allowed?: boolean;
  remaining?: number;
  reset_at?: string;
  retry_after_seconds?: number;
};

export const rateLimitPolicies = {
  adminLogin: { name: "admin:login", limit: 5, windowSeconds: 10 * 60, message: "Too many admin login attempts. Try again later." },
  paymentCreate: { name: "payment:create", limit: 10, windowSeconds: 10 * 60 },
  paymentVerify: { name: "payment:verify", limit: 30, windowSeconds: 5 * 60 },
  estimate: { name: "estimate", limit: 60, windowSeconds: 5 * 60 },
  maps: { name: "maps", limit: 50, windowSeconds: 60 },
  accountLookup: { name: "payments:account-lookup", limit: 20, windowSeconds: 10 * 60 },
  riderJobsRead: { name: "rider:jobs:read", limit: 120, windowSeconds: 60 },
  riderJobsWrite: { name: "rider:jobs:write", limit: 25, windowSeconds: 60 }
} satisfies Record<string, RateLimitPolicy>;

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
    const response = NextResponse.json(
      { error: policy.message || "Too many requests. Try again soon." },
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
