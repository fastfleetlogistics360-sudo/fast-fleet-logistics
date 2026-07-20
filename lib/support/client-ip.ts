import { isIP } from "node:net";

export type SupportTrustedProxy = "vercel" | "cloudflare";

type SupportProxyEnvironment = {
  SUPPORT_TRUSTED_PROXY?: string;
  VERCEL?: string;
};

/**
 * Returns an address only from the proxy boundary explicitly trusted by the
 * deployment. Generic forwarding headers are never accepted here because a
 * direct client can supply them unless the edge guarantees replacement.
 */
export function supportClientIp(request: Request, environment: SupportProxyEnvironment = process.env as SupportProxyEnvironment) {
  const proxy = trustedProxy(environment);
  if (proxy === "vercel") return singleIp(request.headers.get("x-vercel-forwarded-for"));
  if (proxy === "cloudflare") return singleIp(request.headers.get("cf-connecting-ip"));
  return "unknown-ip";
}

function trustedProxy(environment: SupportProxyEnvironment): SupportTrustedProxy | null {
  const configured = environment.SUPPORT_TRUSTED_PROXY?.trim().toLowerCase();
  if (configured === "vercel" || configured === "cloudflare") return configured;
  return environment.VERCEL === "1" ? "vercel" : null;
}

function singleIp(value: string | null) {
  const candidate = value?.trim() || "";
  return candidate && !candidate.includes(",") && isIP(candidate) ? candidate : "unknown-ip";
}
