-- Read-only staging preflight for FAST AI Phase 1B.1.
-- Run in the Supabase SQL editor before applying migration 202611120003.
begin read only;

-- Required roles and every existing overload/grant. No unexpected overload may
-- retain EXECUTE for anon, authenticated, or PUBLIC after the migration.
select rolname from pg_roles where rolname in ('anon', 'authenticated', 'service_role') order by rolname;
select p.oid::regprocedure as function_signature, p.prosecdef as security_definer,
  coalesce(array_agg(g.grantee order by g.grantee) filter (where g.privilege_type='EXECUTE'), '{}') as execute_grantees
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
left join aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
left join pg_roles r on r.oid=acl.grantee
cross join lateral (select coalesce(r.rolname, 'PUBLIC') as grantee, acl.privilege_type) g
where n.nspname='public' and p.proname in ('fast_ai_write_template','fast_ai_write_content','transition_marketing_post')
group by p.oid
order by p.oid::regprocedure::text;

-- Required predecessors, schema shapes, dependencies, RLS, and append-only trigger coverage.
-- Hosted Supabase SQL-editor sessions may not expose CLI migration history.
-- Verify the listed predecessor objects below; this reports whether that
-- internal relation is available without attempting to read a missing table.
select coalesce(to_regclass('supabase_migrations.schema_migrations')::text, 'not exposed to this SQL session') as migration_history_relation;
select table_name, column_name, data_type, udt_name, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('automation_departments','automation_department_memberships','marketing_campaigns','marketing_templates','marketing_posts','marketing_approval_events','marketing_template_versions','marketing_content_versions','communication_logs')
order by table_name, ordinal_position;
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.marketing_campaigns'::regclass,'public.marketing_posts'::regclass,'public.marketing_templates'::regclass,'public.marketing_approval_events'::regclass,'public.marketing_content_versions'::regclass,'public.marketing_template_versions'::regclass)
order by conrelid::regclass::text, conname;
select 'unexpected_campaign_status' as check_name, status::text as value, count(*)
from public.marketing_campaigns
where status not in ('draft','active','paused','completed','cancelled','in_review','approved','scheduled','rejected','archived')
group by status;
select 'unexpected_approval_event' as check_name, event_type as value, count(*)
from public.marketing_approval_events
where event_type not in ('created','reviewed','approved','rejected','revision_requested','scheduled','processing','published','failed','cancelled','approval_invalidated','retry_requested','pause_changed')
group by event_type;
select c.relname as table_name, c.relrowsecurity as rls_enabled, p.polname, pg_get_expr(p.polqual,p.polrelid) as using_expression
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_policy p on p.polrelid=c.oid
where n.nspname='public' and c.relname in ('automation_departments','marketing_template_versions','marketing_content_versions','marketing_posts','marketing_templates','marketing_campaigns')
order by c.relname, p.polname;
select event_object_table as table_name, trigger_name, action_timing, event_manipulation, action_statement
from information_schema.triggers
where event_object_schema='public' and event_object_table in ('marketing_approval_events','marketing_content_versions','marketing_template_versions','communication_logs','marketing_posts')
order by event_object_table, trigger_name, event_manipulation;

-- Safety settings must remain disabled/paused before and after migration.
select foundation_enabled, website_campaigns_enabled, instagram_publishing_enabled,
  zoho_campaigns_enabled, whatsapp_marketing_enabled, global_paused, paused_channels
from public.automation_settings where id=true;

rollback;
