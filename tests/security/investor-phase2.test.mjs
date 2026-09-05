import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("security-remediation/migrations/202609050003_investor_programme_phase2.sql", "utf8");
const postflight = readFileSync("security-remediation/investor-programme-phase2-postflight.sql", "utf8");
const adminInvestors = readFileSync("app/api/admin/investors/route.ts", "utf8");
const invitationEmail = readFileSync("lib/investor-email.ts", "utf8");
const onboarding = readFileSync("components/investor/investor-onboarding.tsx", "utf8");
const riderLedger = readFileSync("lib/wallet-ledger.ts", "utf8");

test("Phase 2 keeps investor money in an isolated ledger", () => {
  for (const table of ["investor_wallets", "investor_delivery_settlements", "investor_ledger_entries", "investor_withdrawal_requests"]) {
    assert.match(migration, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
  assert.match(migration, /delivery_id uuid not null unique/i);
  assert.match(migration, /grant execute on function public\.settle_investor_delivery/i);
  assert.match(migration, /to service_role/i);
});

test("the configured split is exact and maintenance only reduces the owner share", () => {
  assert.match(migration, /rider_share := round\(gross \* 0\.30, 0\)/i);
  assert.match(migration, /company_share := round\(gross \* 0\.10, 0\)/i);
  assert.match(migration, /reserve_share := case when control_enabled then round\(gross \* 0\.05, 0\) else 0 end/i);
  assert.match(migration, /owner_share := gross - rider_share - company_share - reserve_share/i);
  assert.match(migration, /investor_delivery_settlement_split check/i);
  assert.match(riderLedger, /settleInvestorDelivery/i);
});

test("maintenance reserve and payout actions are controlled server-side", () => {
  assert.match(migration, /set_investor_asset_maintenance_reserve/i);
  assert.match(migration, /request_investor_withdrawal/i);
  assert.match(migration, /review_investor_withdrawal/i);
  assert.match(migration, /A verified payout account is required/i);
  assert.match(migration, /alter table public\.investor_wallets enable row level security/i);
  assert.doesNotMatch(migration, /create policy .*investor_payout_accounts/i);
});

test("Phase 2 has a read-only production verification report", () => {
  const executableSql = postflight.replace(/^--.*$/gm, "");
  assert.match(postflight, /investor_delivery_settlement_split/i);
  assert.match(postflight, /having count\(\*\) > 1/i);
  assert.doesNotMatch(executableSql, /\b(?:insert|update|delete|alter|create|drop)\b/i);
});

test("invites support existing FastFleets users and mail scanners cannot spend the token", () => {
  assert.match(adminInvestors, /existingAccount = Boolean\(existing\?\.id\)/);
  assert.match(adminInvestors, /type: "magiclink", email/);
  assert.match(adminInvestors, /token_hash/);
  assert.match(invitationEmail, /https:\/\/api\.resend\.com\/emails/);
  assert.doesNotMatch(adminInvestors, /inviteUserByEmail/);
  assert.match(onboarding, /supabase\.auth\.verifyOtp/);
  assert.match(onboarding, /type === "recovery"/);
});
