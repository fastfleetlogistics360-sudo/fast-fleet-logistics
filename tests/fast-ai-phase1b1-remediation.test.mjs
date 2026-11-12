import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("Phase 1B.1 repairs campaign and approval-event constraints", () => {
  const sql = read("security-remediation/migrations/202611120003_fast_ai_phase1b1_security_integrity.sql");
  assert.match(sql, /'archived'/);
  assert.match(sql, /'revision_requested'/);
  assert.match(sql, /drop constraint if exists marketing_campaigns_status_check/);
  assert.match(sql, /drop constraint if exists marketing_approval_events_event_type_check/);
});

test("Phase 1B.1 adds membership scoping and immutable history triggers", () => {
  const sql = read("security-remediation/migrations/202611120003_fast_ai_phase1b1_security_integrity.sql");
  assert.match(sql, /automation_department_memberships/);
  for (const table of ["marketing_approval_events", "marketing_content_versions", "marketing_template_versions", "communication_logs"]) assert.match(sql, new RegExp(`${table}_immutable`));
  assert.match(sql, /FAST AI history is append-only/);
  for (const table of ["marketing_approval_events", "marketing_content_versions", "marketing_template_versions", "communication_logs"]) assert.match(sql, new RegExp(`${table}_no_truncate`));
});

test("Phase 1B.1 exposes only the reviewed service-role RPC signatures", () => {
  const sql = read("security-remediation/migrations/202611120003_fast_ai_phase1b1_security_integrity.sql");
  assert.match(sql, /drop function %s/);
  assert.match(sql, /grant execute on function public\.fast_ai_write_template\(uuid,text,text,jsonb,uuid,uuid,boolean,boolean\) to service_role/);
  assert.match(sql, /grant execute on function public\.fast_ai_write_content\(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,boolean,boolean\) to service_role/);
  assert.match(sql, /revoke all on function public\.fast_ai_write_template[\s\S]*from public, anon, authenticated/);
  assert.match(sql, /revoke all on function public\.fast_ai_write_content[\s\S]*from public, anon, authenticated/);
});

test("Phase 1B.1 fails closed for NULL creators and cross-department links", () => {
  const sql = read("security-remediation/migrations/202611120003_fast_ai_phase1b1_security_integrity.sql");
  assert.match(sql, /row\.created_by is distinct from actor/);
  assert.match(sql, /current_post\.created_by is not distinct from actor/);
  assert.match(sql, /Campaign must belong to the same department as content/);
  assert.match(sql, /Template must belong to the same department as content/);
  assert.match(sql, /if next_department_id is null then raise exception 'Department is required'/);
});

test("Phase 1B.1 routes writes through server-scoped atomic functions", () => {
  const route = read("app/api/admin/automation/manage/route.ts");
  const permissions = read("lib/automation/permissions.ts");
  assert.match(route, /authorizeDepartmentAction/);
  assert.match(route, /fast_ai_write_template/);
  assert.match(route, /fast_ai_write_content/);
  assert.match(route, /set_department_membership/);
  assert.match(route, /requestedDepartment/);
  assert.match(route, /if \(!requestedDepartment\) return false/);
  assert.match(permissions, /automationDepartmentIdsFor/);
  assert.match(permissions, /hasDepartmentPermission/);
});

test("Phase 1B.1 scopes activity and sensitive settings reads", () => {
  const route = read("app/api/admin/automation/route.ts");
  assert.match(route, /const superAdmin = permission === "super_admin"/);
  assert.match(route, /\.in\("post_id", postIds\)/);
  assert.match(route, /automation_admin_permissions/);
});

test("Phase 1B.1 has a read-only catalog preflight", () => {
  const preflight = read("security-remediation/preflight/202611120003_fast_ai_phase1b1_catalog_preflight.sql");
  assert.match(preflight, /begin read only/);
  assert.match(preflight, /pg_proc/);
  assert.match(preflight, /pg_policy/);
  assert.match(preflight, /rollback/);
});
