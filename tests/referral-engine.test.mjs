import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../security-remediation/migrations/202610070001_refer_and_win.sql", import.meta.url);
const referralRoutePath = new URL("../app/api/referrals/route.ts", import.meta.url);
const intentRoutePath = new URL("../app/api/referrals/intent/route.ts", import.meta.url);
const claimRoutePath = new URL("../app/referrals/claim/route.ts", import.meta.url);
const cyclistApplicationRoutePath = new URL("../app/api/referrals/cyclist-applications/route.ts", import.meta.url);
const cyclistApplicationServicePath = new URL("../lib/cyclist-rider-application.ts", import.meta.url);
const marketplaceWorkflowPath = new URL("../lib/marketplace-order-workflow.ts", import.meta.url);
const fastErrandCheckoutPath = new URL("../app/api/fast-errands/checkout/route.ts", import.meta.url);
const deliveryCompletionPath = new URL("../lib/delivery-completion.ts", import.meta.url);
const fleetAssetsPath = new URL("../lib/fleet-assets.ts", import.meta.url);

async function source(url) { return readFile(url, "utf8"); }

test("referral schema makes codes, acquisition attribution, and rewards unique", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /referral_codes[\s\S]*user_id uuid not null unique/);
  assert.match(sql, /referral_codes[\s\S]*code text not null unique/);
  assert.match(sql, /referrals[\s\S]*referred_user_id uuid not null unique/);
  assert.match(sql, /referral_rewards[\s\S]*referral_id uuid not null unique/);
  assert.match(sql, /idempotency_key text not null unique/);
  assert.match(sql, /replace\(gen_random_uuid\(\)::text, '-', ''\)/);
  assert.doesNotMatch(sql, /gen_random_bytes/);
});

test("attribution is a server-stored intent and rejects existing accounts and self-referrals", async () => {
  const [sql, intentRoute, claimRoute] = await Promise.all([source(migrationPath), source(intentRoutePath), source(claimRoutePath)]);
  assert.match(sql, /create table if not exists public\.referral_attribution_intents/);
  assert.match(sql, /target_created_at <= intent\.created_at/);
  assert.match(sql, /source_code\.user_id = target_user_id/);
  assert.match(intentRoute, /referral_attribution_intents/);
  assert.match(claimRoute, /claim_referral_attribution/);
});

test("qualification is tied to canonical delivered records and is retry-safe", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /new\.status = 'delivered' and old\.status is distinct from 'delivered'/);
  assert.match(sql, /coalesce\(delivery\.metadata ->> 'is_test', 'false'\)/);
  assert.match(sql, /where referral_id = customer_referral\.id and status = 'pending'/);
  assert.match(sql, /where referral_id = cyclist_referral\.id and status = 'pending'/);
  assert.match(sql, /join public\.cyclist_applications ca[\s\S]*ca\.status = 'rider_activated'/);
  assert.match(sql, /application_status = 'approved'/);
});

test("ordinary, Marketplace, and FastErrand completions converge on delivered records", async () => {
  const [sql, workflow, fastErrandCheckout, deliveryCompletion] = await Promise.all([
    source(migrationPath), source(marketplaceWorkflowPath), source(fastErrandCheckoutPath), source(deliveryCompletionPath)
  ]);
  assert.match(sql, /after update of status on public\.deliveries/);
  assert.match(sql, /new\.status = 'delivered' and old\.status is distinct from 'delivered'/);
  assert.match(workflow, /transitionCreatesDelivery\(status, deliveryId\)/);
  assert.match(workflow, /marketplace_kind === "fast_errands"/);
  assert.match(fastErrandCheckout, /marketplace_kind: "fast_errands"/);
  assert.match(deliveryCompletion, /fast_errand_orders[\s\S]*status: "delivered"/);
});

test("wallet transfer is atomic, owner-authorized, and ledger-backed", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /select \* into reward from public\.referral_rewards where id = target_reward_id for update/);
  assert.match(sql, /reward\.referrer_user_id <> auth\.uid\(\)/);
  assert.match(sql, /if reward\.status <> 'available'/);
  assert.match(sql, /'referral_reward'/);
  assert.match(sql, /provider_reference, description, metadata\)[\s\S]*'referral-reward:'/);
  assert.match(sql, /set status = 'transferred', transferred_at = now\(\), wallet_transaction_id = transaction_id/);
});

test("campaign rewards snapshot the amount, respect pause-at-claim, and preserve pending rewards", async () => {
  const [sql, dashboardRoute] = await Promise.all([source(migrationPath), source(referralRoutePath)]);
  assert.match(sql, /insert into public\.referral_rewards\(referral_id, campaign_id, referrer_user_id, amount_ngn, idempotency_key\)\s+values \(referral_id, campaign\.id, source_code\.user_id, campaign\.reward_amount_ngn/);
  assert.match(sql, /where slug = campaign_slug and is_active and \(starts_at is null or starts_at <= now\(\)\) and \(ends_at is null or ends_at > now\(\)\)/);
  assert.match(dashboardRoute, /from\("referral_rewards"\)[\s\S]*\.eq\("referrer_user_id", user\.id\)/);
  assert.match(sql, /if reward\.status <> 'available'/);
});

test("cyclist activation requires approval without assigning a dispatch bicycle", async () => {
  const [sql, fleetAssets, applicationRoute, applicationService] = await Promise.all([source(migrationPath), source(fleetAssetsPath), source(cyclistApplicationRoutePath), source(cyclistApplicationServicePath)]);
  const activation = sql.slice(sql.indexOf("create or replace function public.activate_cyclist_rider"), sql.indexOf("alter table public.referral_codes"));
  const qualification = sql.slice(sql.indexOf("create or replace function public.qualify_referral_from_delivery"), sql.indexOf("create or replace function public.process_referral_delivery_completion"));
  assert.match(applicationRoute, /submitCyclistRiderApplication/);
  assert.match(applicationRoute, /account\?\.account_type !== "rider"/);
  assert.match(applicationService, /campaign_type === "cyclist"/);
  assert.match(applicationService, /referral_id: referralId/);
  assert.match(activation, /application\.status <> 'approved'/);
  assert.match(activation, /rider_account_type = 'fastfleets360'/);
  assert.doesNotMatch(activation, /vehicle_type/);
  assert.match(qualification, /ca\.referral_id = r\.id[\s\S]*ca\.status = 'rider_activated'/);
  assert.match(qualification, /delivery\.rider_id is null then return/);
  assert.match(fleetAssets, /assigned_rider_profile_id/);
  assert.match(fleetAssets, /asset\.status === "available"/);
});

test("RLS prevents clients from self-qualifying rewards or activating cyclist riders", async () => {
  const sql = await source(migrationPath);
  assert.match(sql, /alter table public\.referral_rewards enable row level security/);
  assert.match(sql, /Users create own cyclist applications[\s\S]*status = 'submitted' and referral_id is null/);
  assert.match(sql, /Only admins can review cyclist applications/);
  assert.match(sql, /Only admins can activate cyclist riders/);
  assert.match(sql, /grant execute on function public\.claim_referral_attribution\(uuid\) to authenticated/);
  assert.doesNotMatch(sql, /grant execute on function public\.attribute_referral\(text, text\) to authenticated/);
});

test("dashboard generates the stable code server-side rather than exposing user IDs", async () => {
  const route = await source(referralRoutePath);
  assert.match(route, /ensure_referral_code/);
  assert.match(route, /referralLink\(origin, codeData, "customer_referral"\)/);
  assert.match(route, /referralLink\(origin, codeData, "cyclist_referral"\)/);
  assert.match(route, /referral:referrals!inner\(referred_user_id, referred:users!referrals_referred_user_id_fkey/);
  assert.doesNotMatch(route, /\), referred:users!referrals_referred_user_id_fkey/);
  assert.doesNotMatch(route, /user\.id.*ref=/);
});
