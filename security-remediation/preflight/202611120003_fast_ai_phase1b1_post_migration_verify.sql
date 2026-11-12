-- FAST AI Phase 1B.1 POST-migration verification (read-only).
-- Run after 202611120003 has completed. Returns one result set only.
with
expected_rpcs(check_name, signature) as (values
  ('template RPC', 'public.fast_ai_write_template(uuid,text,text,jsonb,uuid,uuid,boolean,boolean)'),
  ('content RPC', 'public.fast_ai_write_content(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,boolean,boolean)')
),
rpc_catalog as (select check_name, signature, to_regprocedure(signature) as oid from expected_rpcs),
history_tables(table_name) as (values ('marketing_approval_events'), ('marketing_content_versions'), ('marketing_template_versions'), ('communication_logs')),
checks as (
  select 10 as sort_order, 'exact write RPC signatures' as check_name,
    case when count(*)=2 then 'PASS' else 'FAIL' end as status,
    case when count(*)=2 then 'Both reviewed write RPC signatures exist.' else 'One or more reviewed write RPC signatures is missing.' end as detail
  from rpc_catalog where oid is not null

  union all
  select 20, 'no unexpected write RPC overloads',
    case when count(*)=2 then 'PASS' else 'FAIL' end,
    'Expected exactly two public FAST AI write RPC overloads; found ' || count(*) || '.'
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fast_ai_write_template','fast_ai_write_content')

  union all
  select 30, 'security definer RPCs',
    case when count(*)=2 and bool_and(p.prosecdef) then 'PASS' else 'FAIL' end,
    'Both write RPCs must be SECURITY DEFINER.'
  from rpc_catalog r join pg_proc p on p.oid=r.oid

  union all
  select 40, 'service_role EXECUTE grants',
    case when count(*)=2 and bool_and(exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a join pg_roles role_row on role_row.oid=a.grantee where role_row.rolname='service_role' and a.privilege_type='EXECUTE')) then 'PASS' else 'FAIL' end,
    'service_role must have EXECUTE on both write RPCs.'
  from rpc_catalog r join pg_proc p on p.oid=r.oid

  union all
  select 50, 'browser EXECUTE denied',
    case when count(*)=2 and bool_and(not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f',p.proowner))) a left join pg_roles role_row on role_row.oid=a.grantee where a.privilege_type='EXECUTE' and (a.grantee=0 or role_row.rolname in ('anon','authenticated')))) then 'PASS' else 'FAIL' end,
    'PUBLIC, anon and authenticated must not have EXECUTE on either write RPC.'
  from rpc_catalog r join pg_proc p on p.oid=r.oid

  union all
  select 60, 'department membership table protected',
    case when to_regclass('public.automation_department_memberships') is not null
                   and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.automation_department_memberships')),false)
              then 'PASS' else 'FAIL' end,
    'Membership table must exist with RLS enabled.'

  union all
  select 70, 'append-only UPDATE/DELETE triggers',
    case when not exists (select 1 from history_tables h where not exists (select 1 from information_schema.triggers t where t.event_object_schema='public' and t.event_object_table=h.table_name and t.trigger_name like '%_immutable' and t.event_manipulation='UPDATE'))
                   and not exists (select 1 from history_tables h where not exists (select 1 from information_schema.triggers t where t.event_object_schema='public' and t.event_object_table=h.table_name and t.trigger_name like '%_immutable' and t.event_manipulation='DELETE')) then 'PASS' else 'FAIL' end,
    'Each history table must have a trigger covering UPDATE and DELETE.'

  union all
  select 80, 'append-only TRUNCATE triggers',
    case when not exists (select 1 from history_tables h where not exists (select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=h.table_name and t.tgname like '%_no_truncate' and not t.tgisinternal and (t.tgtype::integer & 32) = 32)) then 'PASS' else 'FAIL' end,
    'Each history table must have a TRUNCATE-rejection trigger.'

  union all
  select 90, 'automation remains disabled and paused',
    case when exists (select 1 from public.automation_settings where id=true and foundation_enabled=false and website_campaigns_enabled=false and instagram_publishing_enabled=false and zoho_campaigns_enabled=false and whatsapp_marketing_enabled=false and global_paused=true and paused_channels @> '["instagram","zoho","whatsapp_marketing"]'::jsonb) then 'PASS' else 'FAIL' end,
    'All feature flags must be false; global pause and external channel pauses must remain enabled.'
),
overall as (
  select 999 as sort_order, 'OVERALL' as check_name,
    case when exists (select 1 from checks where status='FAIL') then 'NOT VERIFIED' else 'POST-MIGRATION VERIFIED' end as status,
    case when exists (select 1 from checks where status='FAIL') then 'Do not deploy the Phase 1B.1 application code until every failed check is resolved.' else 'Database controls verified. Automation remains disabled and globally paused.' end as detail
)
select check_name, status, detail
from (select sort_order, check_name, status, detail from checks union all select sort_order, check_name, status, detail from overall) report
order by sort_order;
