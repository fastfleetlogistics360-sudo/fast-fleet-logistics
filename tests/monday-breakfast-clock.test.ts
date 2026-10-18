import assert from "node:assert/strict";
import test from "node:test";
import { formatMondayBreakfastCountdown, mondayBreakfastTickerSnapshot } from "../lib/monday-breakfast-clock.ts";

// Nigeria is UTC+1 year-round. Each fixture is expressed in UTC to prove the
// browser's own timezone has no effect on the Lagos campaign calendar.
const at = (value: string) => new Date(value);

test("uses the next Monday start on Sunday at 11:59 PM WAT", () => {
  const result = mondayBreakfastTickerSnapshot(at("2026-10-18T22:59:00.000Z"));
  assert.equal(result.state, "upcoming");
  assert.equal(formatMondayBreakfastCountdown(result.remainingMs, true), "00d 10h 01m 00s");
});

test("transitions exactly at the Monday campaign boundaries in Lagos", () => {
  assert.equal(mondayBreakfastTickerSnapshot(at("2026-10-19T08:59:59.000Z")).state, "upcoming");
  const opens = mondayBreakfastTickerSnapshot(at("2026-10-19T09:00:00.000Z"));
  assert.equal(opens.state, "active");
  assert.equal(formatMondayBreakfastCountdown(opens.remainingMs, false), "02h 00m 00s");
  assert.equal(mondayBreakfastTickerSnapshot(at("2026-10-19T10:00:00.000Z")).state, "active");
  assert.equal(mondayBreakfastTickerSnapshot(at("2026-10-19T10:59:59.000Z")).state, "active");
  assert.equal(mondayBreakfastTickerSnapshot(at("2026-10-19T11:00:00.000Z")).state, "finished");
});

test("counts down to the following Monday after the active window", () => {
  const tuesday = mondayBreakfastTickerSnapshot(at("2026-10-20T08:00:00.000Z"));
  assert.equal(tuesday.state, "upcoming");
  const followingMonday = mondayBreakfastTickerSnapshot(at("2026-10-26T08:59:59.000Z"));
  assert.equal(followingMonday.state, "upcoming");
});
