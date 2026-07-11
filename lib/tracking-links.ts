export function accountTrackingHref(orderCodeOrId: string | null | undefined) {
  const value = String(orderCodeOrId || "").trim();
  if (!value) return "/track";
  return `/account/orders/${encodeURIComponent(value)}/track`;
}

export function accountMessengerHref(orderCodeOrId: string | null | undefined) {
  const value = String(orderCodeOrId || "").trim();
  if (!value) return "/track";
  return `/account/orders/${encodeURIComponent(value)}/messenger`;
}

export function publicTrackingHref(orderCodeOrId: string | null | undefined) {
  const value = String(orderCodeOrId || "").trim();
  if (!value) return "/track";
  return `/track?code=${encodeURIComponent(value)}`;
}
