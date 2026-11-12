-- FAST AI Phase 1B.1 consolidated PRE-migration audit.
-- Read-only: returns exactly one result set and makes no schema/data changes.
with
expected_roles(role_name) as (values ('service_role'::text), ('anon'::text), ('authenticated'::text)),
expected_rpcs(check_key, function_name, signature) as (
  values
    ('template_write_rpc', 'fast_ai_write_template', 'public.fast_ai_write_template(uuid,text,text,jsonb,uuid,uuid,boolean,boolean)'),
    ('content_write_rpc', 'fast_ai_write_content', 'public.fast_ai_write_content(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,boolean,boolean)')
),
rpc_catalog as (
  select e.*, to_regprocedure(e.signature) as function_oid
  from expected_rpcs e
),
fast_ai_overloads as (
  select p.oid, p.proname, p.oid::regprocedure::text as signature
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('fast_ai_write_template','fast_ai_write_content')
),
required_tables(table_name) as (values
  ('automation_settings'), ('automation_admin_permissions'), ('automation_departments'),
  ('marketing_campaigns'), ('marketing_templates'), ('marketing_posts'),
  ('marketing_approval_events'), ('marketing_template_versions'), ('marketing_content_versions'),
  ('marketing_job_outbox'), ('publishing_logs'), ('communication_logs')
),
required_columns(table_name, column_name) as (values
  ('marketing_campaigns','department_id'), ('marketing_campaigns','archived_at'),
  ('marketing_templates','department_id'), ('marketing_templates','version'),
  ('marketing_posts','department_id'), ('marketing_posts','campaign_id'), ('marketing_posts','template_id'), ('marketing_posts','content_version'),
  ('marketing_approval_events','event_type'), ('marketing_content_versions','version'), ('marketing_template_versions','version')
),
required_rls(table_name) as (values
  ('automation_settings'), ('automation_admin_permissions'), ('automation_departments'),
  ('marketing_campaigns'), ('marketing_templates'), ('marketing_posts'),
  ('marketing_approval_events'), ('marketing_template_versions'), ('marketing_content_versions'),
  ('marketing_job_outbox'), ('publishing_logs'), ('communication_logs')
),
checks as (
  select 10 as sort_order, 'roles' as check_name,
    case when count(*)=3 then 'PASS' else 'FAIL' end as status,
    'Required roles found: ' || coalesce(string_agg(r.rolname, ', ' order by r.rolname), 'none') as detail
  from expected_roles e left join pg_roles r on r.rolname=e.role_name

  union all
  select 20, 'intended RPC signatures',
    case when count(*)=0 then 'PASS' when count(*)=2 then 'REVIEW' else 'FAIL' end,
    case when count(*)=0 then 'No pre-existing Phase 1B.1 write RPCs; migration will create the two reviewed signatures.'
         when count(*)=2 then 'Both intended RPC signatures already exist; inspect grants before re-running any migration.'
         else 'Only one intended RPC signature exists; investigate partial migration state.' end
  from rpc_catalog where function_oid is not null

  union all
  select 30, 'unexpected RPC overloads',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    case when count(*)=0 then 'No pre-existing FAST AI write RPC overloads.'
         else 'Unexpected existing overload(s): ' || string_agg(signature, '; ' order by signature) end
  from fast_ai_overloads

  union all
  select 40, 'service_role EXECUTE grants',
    case when count(*)=0 then 'REVIEW'
         when bool_and(exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a join pg_roles r on r.oid=a.grantee where r.rolname='service_role' and a.privilege_type='EXECUTE')) then 'PASS'
         else 'FAIL' end,
    case when count(*)=0 then 'Cannot verify before migration: the intended RPCs do not yet exist.'
         else 'Each existing intended RPC must grant EXECUTE to service_role.' end
  from rpc_catalog c join pg_proc p on p.oid=c.function_oid

  union all
  select 50, 'browser EXECUTE denial',
    case when count(*)=0 then 'REVIEW'
         when bool_and(not exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid=a.grantee where a.privilege_type='EXECUTE' and (a.grantee=0 or r.rolname in ('anon','authenticated')))) then 'PASS'
         else 'FAIL' end,
    case when count(*)=0 then 'Cannot verify before migration: the intended RPCs do not yet exist.'
         else 'PUBLIC, anon and authenticated must not have EXECUTE.' end
  from rpc_catalog c join pg_proc p on p.oid=c.function_oid

  union all
  select 60, 'Phase 1A/1B migration history',
    case when to_regclass('supabase_migrations.schema_migrations') is null then 'REVIEW' else 'REVIEW' end,
    case when to_regclass('supabase_migrations.schema_migrations') is null then 'Supabase SQL Editor does not expose CLI migration history in this project; predecessor schema is checked below.'
         else 'Migration-history relation exists, but version rows should be verified in your deployment tooling.' end

  union all
  select 70, 'required tables',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    case when count(*)=0 then 'All required Phase 1A/1B tables exist.'
         else 'Missing table(s): ' || string_agg(t.table_name, ', ' order by t.table_name) end
  from required_tables t where to_regclass('public.' || t.table_name) is null

  union all
  select 80, 'required columns',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    case when count(*)=0 then 'Required Phase 1B columns exist.'
         else 'Missing column(s): ' || string_agg(c.table_name || '.' || c.column_name, ', ' order by c.table_name, c.column_name) end
  from required_columns c left join information_schema.columns i on i.table_schema='public' and i.table_name=c.table_name and i.column_name=c.column_name
  where i.column_name is null

  union all
  select 90, 'required constraints',
    case when exists (select 1 from pg_constraint where conrelid='public.marketing_campaigns'::regclass and contype='c')
           and exists (select 1 from pg_constraint where conrelid='public.marketing_approval_events'::regclass and contype='c')
         then 'PASS' else 'FAIL' end,
    'Campaign and approval-event check constraints must exist before Phase 1B.1 replaces them.'

  union all
  select 100, 'historical campaign statuses',
    case when exists (select 1 from public.marketing_campaigns where status not in ('draft','active','paused','completed','cancelled','in_review','approved','scheduled','rejected','archived')) then 'FAIL' else 'PASS' end,
    case when exists (select 1 from public.marketing_campaigns where status not in ('draft','active','paused','completed','cancelled','in_review','approved','scheduled','rejected','archived'))
         then 'Unsupported campaign status exists and would violate the replacement constraint.' else 'All existing campaign statuses are compatible.' end

  union all
  select 110, 'historical approval event types',
    case when exists (select 1 from public.marketing_approval_events where event_type not in ('created','reviewed','approved','rejected','revision_requested','scheduled','processing','published','failed','cancelled','approval_invalidated','retry_requested','pause_changed')) then 'FAIL' else 'PASS' end,
    case when exists (select 1 from public.marketing_approval_events where event_type not in ('created','reviewed','approved','rejected','revision_requested','scheduled','processing','published','failed','cancelled','approval_invalidated','retry_requested','pause_changed'))
         then 'Unsupported approval event type exists and would violate the replacement constraint.' else 'All existing approval event types are compatible.' end

  union all
  select 120, 'RLS enabled on FAST AI tables',
    case when count(*)=0 then 'PASS' else 'FAIL' end,
    case when count(*)=0 then 'RLS is enabled on every required table.'
         else 'RLS missing on: ' || string_agg(r.table_name, ', ' order by r.table_name) end
  from required_rls r left join pg_class c on c.oid=to_regclass('public.' || r.table_name)
  where coalesce(c.relrowsecurity,false)=false

  union all
  select 130, 'append-only history triggers',
    'REVIEW',
    'Pre-migration deferred: UPDATE, DELETE and TRUNCATE rejection triggers are introduced by 202611120003 and must be verified immediately after application.'

  union all
  select 140, 'FAST AI feature flags disabled',
    case when exists (select 1 from public.automation_settings where id=true and foundation_enabled=false and website_campaigns_enabled=false and instagram_publishing_enabled=false and zoho_campaigns_enabled=false and whatsapp_marketing_enabled=false) then 'PASS' else 'FAIL' end,
    'All FAST AI feature flags must be false.'

  union all
  select 150, 'global pause enabled',
    case when exists (select 1 from public.automation_settings where id=true and global_paused=true) then 'PASS' else 'FAIL' end,
    'global_paused must be true.'

  union all
  select 160, 'external channels paused',
    case when exists (select 1 from public.automation_settings where id=true and paused_channels @> '["instagram","zoho","whatsapp_marketing"]'::jsonb) then 'PASS' else 'FAIL' end,
    'paused_channels must include instagram, zoho, and whatsapp_marketing.'
),
overall as (
  select 999 as sort_order, 'OVERALL' as check_name,
    case when exists (select 1 from checks where status='FAIL') then 'NOT READY FOR STAGING MIGRATION' else 'READY FOR STAGING MIGRATION' end as status,
    case when exists (select 1 from checks where status='FAIL') then 'Resolve every FAIL before applying 202611120003. REVIEW rows are explicit post-migration verification requirements.'
         else 'Pre-migration safeguards passed. Apply only in staging, then run the post-migration verification checks for the deferred RPC grants and append-only triggers.' end as detail
)
select check_name, status, detail
from (select sort_order, check_name, status, detail from checks union all select sort_order, check_name, status, detail from overall) report
order by sort_order;
