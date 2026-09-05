import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("security-remediation/migrations/202609050001_investor_dashboard_foundation.sql", "utf8");
const roleMigration = readFileSync("security-remediation/migrations/202609050000_investor_role_enum.sql", "utf8");
const foreignKeyMigration = readFileSync("security-remediation/migrations/202609050002_investor_dashboard_delivery_asset_fk.sql", "utf8");
const roles = readFileSync("lib/auth/roles.ts", "utf8");
const publicAuth = readFileSync("components/auth/phone-auth-form.tsx", "utf8");

test("investor ownership foundation keeps one active owner and immutable history", () => {
  assert.match(migration, /create table if not exists public\.investor_asset_assignments/i);
  assert.match(migration, /investor_asset_assignments_one_active_owner_idx/i);
  assert.match(migration, /where ended_at is null/i);
  assert.match(migration, /prevent_investor_assignment_history_rewrite/i);
  assert.match(migration, /transfer_investor_asset/i);
});

test("investor access is privileged and cannot be publicly selected", () => {
  assert.match(roleMigration, /add value if not exists 'investor'/i);
  assert.match(migration, /Privileged role can only be assigned/i);
  assert.match(roles, /Exclude<UserRole, "admin" \| "investor">/);
  assert.doesNotMatch(publicAuth, /role:\s*"investor"/);
});

test("delivery asset foreign key migration is guarded against orphaned data", () => {
  assert.match(foreignKeyMigration, /left join public\.fleet_assets/i);
  assert.match(foreignKeyMigration, /Cannot add deliveries\.fleet_asset_id foreign key/i);
  assert.match(foreignKeyMigration, /foreign key \(fleet_asset_id\) references public\.fleet_assets\(id\) on delete set null/i);
});

test("payout account storage is encrypted and browser RLS is not granted", () => {
  assert.match(migration, /account_number_ciphertext text not null/i);
  assert.match(migration, /alter table public\.investor_payout_accounts enable row level security/i);
  assert.doesNotMatch(migration, /create policy "Investors read own masked payout account"/i);
});
