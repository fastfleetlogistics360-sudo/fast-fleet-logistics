export const supportStatuses = ["open", "triaged", "in_progress", "waiting_for_customer", "waiting_for_internal", "resolved", "closed"] as const;
export type SupportStatus = (typeof supportStatuses)[number];

export const supportTransitionTargets: Record<SupportStatus, readonly SupportStatus[]> = {
  open: ["triaged", "in_progress", "resolved", "closed"],
  triaged: ["in_progress", "waiting_for_internal", "resolved", "closed"],
  in_progress: ["waiting_for_customer", "waiting_for_internal", "resolved", "closed"],
  waiting_for_customer: ["in_progress", "resolved", "closed"],
  waiting_for_internal: ["in_progress", "waiting_for_customer", "resolved", "closed"],
  resolved: ["in_progress", "closed"],
  closed: ["in_progress"]
};

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && (supportStatuses as readonly string[]).includes(value);
}

export function canTransitionSupportCase(from: SupportStatus, to: SupportStatus) {
  return supportTransitionTargets[from].includes(to);
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function supportAvailability(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const staffed = hour >= 8 && hour < 20;
  return {
    staffed,
    message: staffed
      ? "Support is staffed daily from 08:00 to 20:00 WAT."
      : "Support is currently outside staffed hours (08:00–20:00 WAT daily). You can still send a case and our team will respond when staffed."
  };
}

export function shouldAutoClose(resolvedAt: string | null | undefined, now = Date.now()) {
  return Boolean(resolvedAt && new Date(resolvedAt).getTime() + 72 * 60 * 60 * 1000 <= now);
}

export function canCustomerReopen(resolvedAt: string | null | undefined, now = Date.now()) {
  return Boolean(resolvedAt && new Date(resolvedAt).getTime() + 7 * 24 * 60 * 60 * 1000 > now);
}
