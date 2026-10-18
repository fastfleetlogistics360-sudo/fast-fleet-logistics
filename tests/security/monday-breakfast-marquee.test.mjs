import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const marquee = read("components/layout/monday-breakfast-marquee.tsx");
const clock = read("lib/monday-breakfast-clock.ts");
const shell = read("components/layout/site-shell.tsx");
const css = read("app/globals.css");

test("marquee is globally rendered once for every account type and opens Restaurants", () => {
  assert.match(shell, /<MondayBreakfastMarquee/);
  assert.doesNotMatch(shell, /showBreakfastMarquee|pathname\.startsWith\("\/admin"\)/);
  assert.match(marquee, /href="\/restaurants"/);
  assert.doesNotMatch(marquee, /href="\/shopping"/);
});

test("ticker animation is seamless, lightweight, and motion-accessible", () => {
  assert.match(marquee, /ff-marquee-group.*ff-marquee-group/s);
  assert.match(css, /animation: ff-breakfast-ticker 34s linear infinite/);
  assert.match(css, /translateX\(-50%\)/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(marquee, /visibilitychange/);
});

test("marquee remains presentation-only and cannot affect checkout", () => {
  assert.doesNotMatch(marquee, /checkout|payment|reserveMondayFreeBreakfast/i);
  assert.match(clock, /database-authoritative decision/);
});
