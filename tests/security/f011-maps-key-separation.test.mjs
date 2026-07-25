import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const addressAutocomplete = read("app/api/maps/address-autocomplete/route.ts");
const placeDetails = read("app/api/maps/place-details/route.ts");
const reverseGeocode = read("app/api/maps/reverse-geocode/route.ts");
const routeDistance = read("lib/maps/route-distance.ts");
const readiness = read("app/api/health/readiness/route.ts");
const environmentExample = read("types/.env.example");

test("F-011 keeps browser-visible Maps keys out of every server-side Maps request", () => {
  for (const source of [addressAutocomplete, placeDetails, reverseGeocode, routeDistance]) {
    assert.doesNotMatch(source, /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  }

  assert.match(addressAutocomplete, /process\.env\.GOOGLE_PLACES_API_KEY \|\| process\.env\.GOOGLE_MAPS_API_KEY/);
  assert.match(placeDetails, /process\.env\.GOOGLE_PLACES_API_KEY \|\| process\.env\.GOOGLE_MAPS_API_KEY/);
  assert.match(reverseGeocode, /const googleMapsKey = process\.env\.GOOGLE_MAPS_API_KEY;/);
  assert.match(routeDistance, /return process\.env\.GOOGLE_ROUTES_API_KEY \|\| "";/);
});

test("F-011 makes every Maps key explicit in readiness and deployment configuration", () => {
  for (const key of [
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
    "GOOGLE_MAPS_API_KEY",
    "GOOGLE_PLACES_API_KEY",
    "GOOGLE_ROUTES_API_KEY"
  ]) {
    assert.match(readiness, new RegExp(`"${key}"`));
    assert.match(environmentExample, new RegExp(`^${key}=`, "m"));
  }
});
