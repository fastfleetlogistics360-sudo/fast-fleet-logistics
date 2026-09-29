import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("delivery opportunity push keeps its title, deep link, tag, and compact body", () => {
  const opportunities = read("lib/rider-delivery-opportunities.ts");
  const push = read("lib/notifications/push.ts");
  const worker = read("public/sw.js");

  assert.match(opportunities, /title: "New delivery available"/);
  assert.match(opportunities, /body: `\$\{pickupArea\}/);
  assert.doesNotMatch(opportunities, /body: `Pickup:/);
  assert.match(opportunities, /url: "\/rider\/dashboard\?tab=jobs"/);
  assert.match(opportunities, /tag: `ff-dispatch-\$\{delivery\.delivery_code\}`/);
  assert.doesNotMatch(push, /from Fast Fleets 360/i);
  assert.match(worker, /payload\.tag \|\| data\.tag/);
  assert.match(worker, /notificationclick/);
});

test("unassigned rider offers omit customer contact, proof, and raw metadata", () => {
  const jobs = read("app/api/rider/jobs/route.ts");
  const dashboard = read("components/rider/rider-dashboard.tsx");

  assert.match(jobs, /const offerSelect/);
  assert.match(jobs, /users:users!deliveries_customer_id_fkey\(full_name, avatar_url\)/);
  assert.match(jobs, /stripUnassignedOfferSensitiveFields/);
  assert.match(jobs, /delete offer\.metadata/);
  assert.match(jobs, /delete offer\.pickup_contact/);
  assert.match(jobs, /delete offer\.dropoff_contact/);
  assert.match(jobs, /delete offer\.proof_url/);
  assert.doesNotMatch(dashboard, /Customer: \{customerName\} · \{job\.(?:dropoff_contact|pickup_contact)/);
  assert.match(dashboard, /Customer: \{customerName\}/);
  assert.match(dashboard, /const jobFields/);
  assert.match(dashboard, /pickup_contact[\s\S]*dropoff_contact/);
});

test("incoming offers preserve route values but render a structured pickup-to-dropoff hierarchy", () => {
  const dashboard = read("components/rider/rider-dashboard.tsx");

  assert.match(dashboard, /<OfferRoute pickup=\{job\.pickup_address\} dropoff=\{job\.dropoff_address\}/);
  assert.match(dashboard, /function OfferRoute/);
  assert.match(dashboard, />Pickup</);
  assert.match(dashboard, />TO</);
  assert.match(dashboard, />Dropoff</);
  assert.doesNotMatch(dashboard, /<h2[^>]*>\{job\.pickup_address\} to \{job\.dropoff_address\}<\/h2>/);
  assert.match(dashboard, /\{formatMoney\(job\.price_ngn\)\} estimated earning/);
  assert.match(dashboard, /pickupEtaLabel\(pickupEtaMinutes, pickupEtaLoading, liveLocation\)/);
});
