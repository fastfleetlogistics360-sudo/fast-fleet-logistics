import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("partnership page has indexable canonical metadata and parseable structured data", () => {
  const page = read("app/partners/kwara-media-fashion-week/page.tsx");
  assert.match(page, /Fast Fleets 360/);
  assert.match(page, /Kwara Media Fashion Week/);
  assert.match(page, /alternates: \{ canonical: path \}/);
  assert.match(page, /https:\/\/www\.fastfleet\.com\.ng\/#organization/);
  assert.match(page, /BreadcrumbList/);
  assert.match(page, /fast-fleets-360-kwara-media-fashion-week-official-logistics-partner\.jpg/);
});

test("sitemap contains public SEO pages but not protected private routes", () => {
  const sitemap = read("app/sitemap.ts");
  assert.match(sitemap, /partners\/kwara-media-fashion-week/);
  assert.match(sitemap, /updates\/fast-fleets-360-now-live/);
  assert.doesNotMatch(sitemap, /path: "\/admin"/);
  assert.doesNotMatch(sitemap, /path: "\/account"/);
});

test("organization uses the stable canonical identity and private families get a noindex header", () => {
  const layout = read("app/layout.tsx");
  const middleware = read("middleware.ts");
  assert.match(layout, /https:\/\/www\.fastfleet\.com\.ng\/#organization/);
  assert.match(middleware, /X-Robots-Tag/);
  assert.match(middleware, /noindex, nofollow, noarchive/);
});
