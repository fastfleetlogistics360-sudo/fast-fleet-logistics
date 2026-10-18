export type MondayBreakfastTickerState = "upcoming" | "active" | "finished";

export type MondayBreakfastTickerSnapshot = {
  state: MondayBreakfastTickerState;
  remainingMs: number;
};

/**
 * Presentation-only campaign clock. It deliberately uses an explicit Lagos
 * calendar rather than the device timezone; checkout eligibility remains a
 * separate, database-authoritative decision.
 */
export function mondayBreakfastTickerSnapshot(now = new Date()): MondayBreakfastTickerSnapshot {
  const local = lagosCalendar(now);
  const localTime = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond);
  const mondayStart = Date.UTC(local.year, local.month - 1, local.day, 10, 0, 0);
  const mondayEnd = Date.UTC(local.year, local.month - 1, local.day, 12, 0, 0);
  const weekday = new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay();

  if (weekday === 1 && localTime >= mondayStart && localTime < mondayEnd) {
    return { state: "active", remainingMs: Math.max(0, mondayEnd - localTime) };
  }

  const daysUntilMonday = weekday === 0 ? 1 : weekday === 1 && localTime < mondayStart ? 0 : weekday === 1 ? 7 : 8 - weekday;
  const nextStart = Date.UTC(local.year, local.month - 1, local.day + daysUntilMonday, 10, 0, 0);
  return { state: weekday === 1 && localTime >= mondayEnd ? "finished" : "upcoming", remainingMs: Math.max(0, nextStart - localTime) };
}

export function formatMondayBreakfastCountdown(remainingMs: number, showDays: boolean) {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value: number) => String(value).padStart(2, "0");
  return showDays ? `${two(days)}d ${two(hours)}h ${two(minutes)}m ${two(seconds)}s` : `${two(hours)}h ${two(minutes)}m ${two(seconds)}s`;
}

function lagosCalendar(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second"), millisecond: now.getMilliseconds() };
}
