export function googleRequestReferer(request: Request) {
  const referer = request.headers.get("referer");
  if (referer) return referer;

  const origin = request.headers.get("origin") || new URL(request.url).origin;
  return origin.endsWith("/") ? origin : `${origin}/`;
}
