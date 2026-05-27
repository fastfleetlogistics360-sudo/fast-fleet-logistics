function forwardedOrigin(request: Request) {
  const host = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return "";
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return `${proto}://${host}`.replace(/\/$/, "");
}

export function paymentCallbackOrigin(request: Request) {
  const explicit = process.env.PAYSTACK_CALLBACK_ORIGIN?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const origin = forwardedOrigin(request) || new URL(request.url).origin;
  return origin.replace(/\/$/, "");
}
