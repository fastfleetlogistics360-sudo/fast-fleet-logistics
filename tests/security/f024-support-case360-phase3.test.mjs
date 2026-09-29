import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(path, "utf8");

test("Phase 3 verifies customer-owned delivery and order context before it is linked", () => {
  const supportRoute = read("app/api/support/route.ts");
  const handler = read("lib/support/post-handler.ts");

  assert.match(supportRoute, /from\("deliveries"\).*\.eq\("id", deliveryId\).*\.eq\("customer_id", userId\)/s);
  assert.match(supportRoute, /from\("orders"\).*\.eq\("id", orderId\).*\.eq\("customer_id", userId\)/s);
  assert.match(handler, /SUPPORT_CONTEXT_DENIED/);
  assert.match(handler, /deliveryId: deliveryContext\?\.id \|\| null/);
  assert.match(handler, /orderId: orderContext\?\.id \|\| null/);
});

test("Phase 3 persists delivery and order links through the server-only Case 360 table", () => {
  const context = read("lib/support/context.ts");
  const migration = read("security-remediation/migrations/202609280001_support_context_foundation.sql");

  assert.match(context, /from\("support_case_links"\)\.upsert/);
  const atomicMigration = read("security-remediation/migrations/202609280002_support_atomic_case_creation.sql");
  assert.match(atomicMigration, /create or replace function public\.create_support_case_atomic/);
  assert.match(atomicMigration, /insert into public\.support_case_links/);
  assert.match(atomicMigration, /insert into public\.support_case_events/);
  assert.match(atomicMigration, /Support delivery context is not owned by this customer/);
  assert.match(atomicMigration, /Support order context is not owned by this customer/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.support_case_links from anon/);
  assert.match(migration, /revoke all on public\.support_case_links from authenticated/);
  assert.match(migration, /support_case_links_one_target/);
  assert.match(migration, /support_case_links_unique_order/);
  assert.match(migration, /support_case_links_unique_delivery/);
});

test("Phase 3 creates the ticket, initialization, links, and creation event in one RPC transaction", () => {
  const atomicMigration = read("security-remediation/migrations/202609280002_support_atomic_case_creation.sql");
  const helper = read("lib/support/atomic-ticket.ts");

  assert.match(atomicMigration, /^begin;/m);
  assert.match(atomicMigration, /create or replace function public\.create_support_case_atomic/);
  assert.match(atomicMigration, /insert into public\.support_tickets/);
  assert.match(atomicMigration, /persona, category, subcategory, support_queue, sla_first_response_at, sla_resolution_at/);
  assert.match(atomicMigration, /insert into public\.support_case_events/);
  assert.match(atomicMigration, /return query select existing_ticket_id, false/);
  assert.match(atomicMigration, /exists \(select 1 from public\.support_case_links scl where scl\.ticket_id = st\.id and scl\.delivery_id = next_delivery_id\)/);
  assert.match(atomicMigration, /exists \(select 1 from public\.support_case_links scl where scl\.ticket_id = st\.id and scl\.order_id = next_order_id\)/);
  assert.match(helper, /rpc\("create_support_case_atomic"/);
  assert.doesNotMatch(helper, /create_support_ticket_with_messages/);
});

test("Phase 3 keeps context optional, but rejects anonymous or unowned context inside the transaction", () => {
  const atomicMigration = read("security-remediation/migrations/202609280002_support_atomic_case_creation.sql");

  assert.match(atomicMigration, /next_delivery_id is not null or next_order_id is not null\) and next_user_id is null/);
  assert.match(atomicMigration, /next_delivery_id is not null then[\s\S]*d\.customer_id = next_user_id/);
  assert.match(atomicMigration, /next_order_id is not null and not exists \(select 1 from public\.orders o where o\.id = next_order_id and o\.customer_id = next_user_id\)/);
  assert.match(atomicMigration, /if next_delivery_id is not null then insert into public\.support_case_links/);
  assert.match(atomicMigration, /if next_order_id is not null then insert into public\.support_case_links/);
});

test("Phase 3 reads bounded, role-safe Case 360 projections", () => {
  const context = read("lib/support/context.ts");
  const customerCase = read("app/api/support/cases/[id]/route.ts");
  const adminCase = read("app/api/admin/customer-care/cases/[id]/route.ts");

  assert.match(customerCase, /eq\("id", id\)\.eq\("user_id", user\.id\)/);
  assert.match(customerCase, /\.eq\("visibility", "public"\)/);
  assert.match(customerCase, /\.range\(page \* 50, page \* 50 \+ 49\)/);
  assert.match(adminCase, /requireAdminSession/);
  assert.match(adminCase, /\.range\(page \* 50, page \* 50 \+ 49\)/);
  assert.match(context, /getSupportCaseContext/);
  assert.doesNotMatch(context, /pickup_address|dropoff_address|pickup_contact|dropoff_contact|proof_url|metadata/);
});

test("Phase 3 does not restore legacy support writes or destructive case-event paths", () => {
  const riskSignals = read("app/api/admin/risk-signals/route.ts");
  const customerCase = read("app/api/support/cases/[id]/route.ts");
  const adminCase = read("app/api/admin/customer-care/cases/[id]/route.ts");

  assert.doesNotMatch(riskSignals, /from\("support_tickets"\)|from\("support_messages"\)/);
  assert.doesNotMatch(`${customerCase}\n${adminCase}`, /support_case_events"\)\.(?:delete|update)/);
});
