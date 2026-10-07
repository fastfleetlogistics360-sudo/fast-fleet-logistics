import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("F031: bicycle recruitment is a persisted Rider onboarding choice with a dedicated route", async () => {
  const [migration, riderOnboarding, cyclistPage, choice] = await Promise.all([
    source("security-remediation/migrations/202610070002_cyclist_rider_onboarding.sql"),
    source("app/rider/onboarding/page.tsx"),
    source("app/cyclist/page.tsx"),
    source("components/onboarding/rider-onboarding-choice.tsx")
  ]);
  assert.match(migration, /rider_onboarding_path.*'standard', 'bicycle_application'/s);
  assert.match(migration, /onboarding_path text not null default 'standard'/);
  assert.match(migration, /protect_profile_rider_onboarding_path/);
  assert.match(migration, /protect_rider_profile_onboarding_path/);
  assert.match(migration, /Rider onboarding path can only be changed by FastFleet/);
  assert.match(migration, /drop policy if exists "Users create own cyclist applications"/);
  assert.match(migration, /Cyclist applications are server-mediated/);
  assert.match(riderOnboarding, /RiderOnboardingChoice/);
  assert.match(riderOnboarding, /path === "standard".*rider_onboarding_path === "standard"/s);
  assert.match(cyclistPage, /BicycleRiderApplication/);
  assert.match(cyclistPage, /account=rider/);
  assert.match(choice, /\/api\/rider\/onboarding/);
  assert.match(choice, /Bicycle Rider Application/);
});

test("F031: bicycle submission is Rider-authenticated, prevents duplicate active KYC paths, and preserves cyclist referral attribution", async () => {
  const [service, riderRoute, legacyRoute] = await Promise.all([
    source("lib/cyclist-rider-application.ts"),
    source("app/api/rider/cyclist-application/route.ts"),
    source("app/api/referrals/cyclist-applications/route.ts")
  ]);
  assert.match(riderRoute, /account\?\.account_type !== "rider"/);
  assert.match(service, /activeCyclistStatuses/);
  assert.match(service, /activeStandardStatuses/);
  assert.match(service, /You already have an active bicycle rider application/);
  assert.match(service, /campaign_type === "cyclist"/);
  assert.match(service, /referral_id: referralId/);
  assert.match(legacyRoute, /submitCyclistRiderApplication/);
  assert.doesNotMatch(legacyRoute, /\.insert\(\{\s*user_id: user\.id/s);
});

test("F031: cyclist review writes canonical rider KYC state, while asset allocation separately activates the referral record", async () => {
  const [migration, cyclistAdmin, fleetAssets] = await Promise.all([
    source("security-remediation/migrations/202610070002_cyclist_rider_onboarding.sql"),
    source("app/api/admin/cyclist-applications/route.ts"),
    source("app/api/admin/fleet-assets/route.ts")
  ]);
  assert.match(migration, /canonical_status public\.rider_application_status/);
  assert.match(migration, /update public\.rider_profiles[\s\S]*application_status = canonical_status/);
  assert.match(migration, /update public\.profiles[\s\S]*kyc_status = case/);
  assert.match(migration, /application\.status = 'approved' and next_status in \('rider_activated', 'suspended'\)/);
  assert.match(cyclistAdmin, /transition_cyclist_application/);
  assert.doesNotMatch(cyclistAdmin, /activate_cyclist_rider/);
  assert.match(fleetAssets, /assignedRider\?\.onboarding_path === "bicycle_application"/);
  assert.match(fleetAssets, /activate_cyclist_rider/);
});

test("F031: going online and dashboard allocation status both use the canonical fleet asset", async () => {
  const [availability, dashboard, bicycleRoute, allocationCard] = await Promise.all([
    source("app/api/rider/availability/route.ts"),
    source("components/rider/rider-dashboard.tsx"),
    source("app/api/rider/bicycle/route.ts"),
    source("components/rider/bicycle-allocation-card.tsx")
  ]);
  assert.match(availability, /loadAssignedBicycleAsset/);
  assert.match(availability, /assignedBicycle\.status !== "available"/);
  assert.match(availability, /required before you can go online for bicycle deliveries/);
  assert.match(bicycleRoute, /loadAssignedBicycleAsset/);
  assert.match(bicycleRoute, /investor_asset_assignments/);
  assert.match(dashboard, /BicycleAllocationCard/);
  assert.match(allocationCard, /Earnings are calculated from this bicycle’s ownership/);
  assert.doesNotMatch(allocationCard, /30%|60%|90%/);
});

test("F031: referral and auth returns remain on the bicycle application route", async () => {
  const [cyclistPage, claimRoute, landing] = await Promise.all([
    source("app/cyclist/page.tsx"),
    source("app/referrals/claim/route.ts"),
    source("components/cyclist/cyclist-recruitment-landing.tsx")
  ]);
  assert.match(cyclistPage, /\/referrals\/claim\?returnTo=/);
  assert.match(claimRoute, /requestedReturnTo/);
  assert.match(claimRoute, /safeReturnTo/);
  assert.match(landing, /\/api\/referrals\/intent/);
  assert.match(landing, /campaign: "cyclist"/);
});
