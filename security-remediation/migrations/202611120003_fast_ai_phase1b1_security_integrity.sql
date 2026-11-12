-- FAST AI Phase 1B.1 forward-only remediation.
-- Preflight (read-only): confirm 202611120001/2 objects exist, review existing
-- campaign status values, and back up FAST AI rows before applying. This file
-- does not enable automation, providers, or any feature flag.
begin;

-- Preserve legacy Phase 1A values while accepting the Phase 1B governed model.
alter table public.marketing_campaigns drop constraint if exists marketing_campaigns_status_check;
alter table public.marketing_campaigns add constraint marketing_campaigns_status_check
  check (status in ('draft','active','paused','completed','cancelled','in_review','approved','scheduled','rejected','archived'));

alter table public.marketing_approval_events drop constraint if exists marketing_approval_events_event_type_check;
alter table public.marketing_approval_events add constraint marketing_approval_events_event_type_check check (event_type in
  ('created','reviewed','approved','rejected','revision_requested','scheduled','processing','published','failed','cancelled','approval_invalidated','retry_requested','pause_changed'));

create table if not exists public.automation_department_memberships (
  department_id uuid not null references public.automation_departments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('viewer','editor','approver','manager')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  primary key (department_id, user_id)
);
create index if not exists automation_department_memberships_user_idx on public.automation_department_memberships(user_id, department_id);
alter table public.automation_department_memberships enable row level security;
revoke all on public.automation_department_memberships from anon, authenticated;
drop trigger if exists automation_department_memberships_touch on public.automation_department_memberships;
create trigger automation_department_memberships_touch before update on public.automation_department_memberships for each row execute function public.fast_ai_touch_updated_at();

-- Event and version rows are immutable to every normal DB role. Database owners
-- can still bypass triggers, so this is append-only operational protection—not
-- protection against a compromised database administrator.
create or replace function public.fast_ai_reject_history_mutation() returns trigger language plpgsql as $$
begin raise exception 'FAST AI history is append-only'; end; $$;
drop trigger if exists marketing_approval_events_immutable on public.marketing_approval_events;
create trigger marketing_approval_events_immutable before update or delete on public.marketing_approval_events for each row execute function public.fast_ai_reject_history_mutation();
drop trigger if exists marketing_content_versions_immutable on public.marketing_content_versions;
create trigger marketing_content_versions_immutable before update or delete on public.marketing_content_versions for each row execute function public.fast_ai_reject_history_mutation();
drop trigger if exists marketing_template_versions_immutable on public.marketing_template_versions;
create trigger marketing_template_versions_immutable before update or delete on public.marketing_template_versions for each row execute function public.fast_ai_reject_history_mutation();
drop trigger if exists communication_logs_immutable on public.communication_logs;
create trigger communication_logs_immutable before update or delete on public.communication_logs for each row execute function public.fast_ai_reject_history_mutation();

-- Row triggers do not run for TRUNCATE, so protect that operation explicitly.
-- This remains operational protection: a database owner can disable triggers.
drop trigger if exists marketing_approval_events_no_truncate on public.marketing_approval_events;
create trigger marketing_approval_events_no_truncate before truncate on public.marketing_approval_events for each statement execute function public.fast_ai_reject_history_mutation();
drop trigger if exists marketing_content_versions_no_truncate on public.marketing_content_versions;
create trigger marketing_content_versions_no_truncate before truncate on public.marketing_content_versions for each statement execute function public.fast_ai_reject_history_mutation();
drop trigger if exists marketing_template_versions_no_truncate on public.marketing_template_versions;
create trigger marketing_template_versions_no_truncate before truncate on public.marketing_template_versions for each statement execute function public.fast_ai_reject_history_mutation();
drop trigger if exists communication_logs_no_truncate on public.communication_logs;
create trigger communication_logs_no_truncate before truncate on public.communication_logs for each statement execute function public.fast_ai_reject_history_mutation();

-- Atomic content/template history writes. The API authenticates the actor and
-- scopes their department before calling these functions; functions lock the
-- parent row and append the matching version in the same transaction.
-- Remove every older overload so PostgREST can expose only the reviewed API.
do $$ declare signature text; begin
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fast_ai_write_template'
  loop execute format('drop function %s', signature); end loop;
  for signature in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fast_ai_write_content'
  loop execute format('drop function %s', signature); end loop;
end $$;
create or replace function public.fast_ai_write_template(
  target_id uuid, next_name text, next_channel text, next_content jsonb,
  next_department_id uuid, actor uuid, create_new boolean default false, super_override boolean default false
) returns public.marketing_templates language plpgsql security definer set search_path=public as $$
declare row public.marketing_templates; next_version integer;
begin
  if next_channel not in ('website','instagram','zoho_email','whatsapp_marketing') then raise exception 'Unsupported channel'; end if;
  if next_department_id is null then raise exception 'Department is required'; end if;
  if not super_override and not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=next_department_id and role in ('editor','manager')) then raise exception 'Department editor permission required'; end if;
  if create_new then
    insert into public.marketing_templates(name,channel,content,department_id,created_by,updated_by)
    values(trim(next_name),next_channel,coalesce(next_content,'{}'::jsonb),next_department_id,actor,actor) returning * into row;
    insert into public.marketing_template_versions(template_id,version,content,created_by) values(row.id,1,row.content,actor);
    return row;
  end if;
  select * into row from public.marketing_templates where id=target_id for update;
  if not found then raise exception 'Template not found'; end if;
  if not super_override and (not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=row.department_id and role in ('editor','manager')) or (row.created_by is distinct from actor and not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=row.department_id and role='manager'))) then raise exception 'Department template permission required'; end if;
  next_version := row.version + 1;
  update public.marketing_templates set name=trim(next_name),channel=next_channel,content=coalesce(next_content,'{}'::jsonb),department_id=next_department_id,version=next_version,updated_by=actor where id=target_id returning * into row;
  insert into public.marketing_template_versions(template_id,version,content,created_by) values(row.id,next_version,row.content,actor);
  return row;
end; $$;

create or replace function public.fast_ai_write_content(
  target_id uuid, next_title text, next_channel text, next_content jsonb,
  next_campaign_id uuid, next_template_id uuid, next_department_id uuid,
  actor uuid, create_new boolean default false, super_override boolean default false
) returns public.marketing_posts language plpgsql security definer set search_path=public as $$
declare row public.marketing_posts; next_version integer; linked_department_id uuid;
begin
  if next_channel not in ('website','instagram','zoho_email','whatsapp_marketing') then raise exception 'Unsupported channel'; end if;
  if next_department_id is null then raise exception 'Department is required'; end if;
  if next_campaign_id is not null then
    select department_id into linked_department_id from public.marketing_campaigns where id=next_campaign_id;
    if not found or linked_department_id is distinct from next_department_id then raise exception 'Campaign must belong to the same department as content'; end if;
  end if;
  if next_template_id is not null then
    select department_id into linked_department_id from public.marketing_templates where id=next_template_id;
    if not found or linked_department_id is distinct from next_department_id then raise exception 'Template must belong to the same department as content'; end if;
  end if;
  if not super_override and not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=next_department_id and role in ('editor','manager')) then raise exception 'Department editor permission required'; end if;
  if create_new then
    insert into public.marketing_posts(title,channel,draft_content,campaign_id,template_id,department_id,created_by,updated_by,status)
    values(trim(next_title),next_channel,coalesce(next_content,'{}'::jsonb),next_campaign_id,next_template_id,next_department_id,actor,actor,'draft') returning * into row;
    insert into public.marketing_content_versions(post_id,version,title,content,reason,created_by) values(row.id,1,row.title,row.draft_content,'Created',actor);
    return row;
  end if;
  select * into row from public.marketing_posts where id=target_id for update;
  if not found then raise exception 'Content not found'; end if;
  if not super_override and (not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=row.department_id and role in ('editor','manager')) or (row.created_by is distinct from actor and not exists (select 1 from public.automation_department_memberships where user_id=actor and department_id=row.department_id and role='manager'))) then raise exception 'Department content permission required'; end if;
  next_version := row.content_version + 1;
  update public.marketing_posts set title=trim(next_title),channel=next_channel,draft_content=coalesce(next_content,'{}'::jsonb),campaign_id=next_campaign_id,template_id=next_template_id,department_id=next_department_id,content_version=next_version,updated_by=actor where id=target_id returning * into row;
  insert into public.marketing_content_versions(post_id,version,title,content,reason,created_by) values(row.id,next_version,row.title,row.draft_content,'Edited',actor);
  return row;
end; $$;

revoke all on function public.fast_ai_write_template(uuid,text,text,jsonb,uuid,uuid,boolean,boolean) from public, anon, authenticated;
revoke all on function public.fast_ai_write_content(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,boolean,boolean) from public, anon, authenticated;
grant execute on function public.fast_ai_write_template(uuid,text,text,jsonb,uuid,uuid,boolean,boolean) to service_role;
grant execute on function public.fast_ai_write_content(uuid,text,text,jsonb,uuid,uuid,uuid,uuid,boolean,boolean) to service_role;

-- Preserve the protected transition RPC for the server-side service role and
-- make NULL creators fail the self-approval check closed.
create or replace function public.transition_marketing_post(target_post_id uuid, next_status public.marketing_post_status, actor uuid, note text default null)
returns public.marketing_posts language plpgsql security definer set search_path = public as $$
declare current_post public.marketing_posts; prior_status public.marketing_post_status; allowed boolean := false;
begin
  select * into current_post from public.marketing_posts where id = target_post_id for update;
  if not found then raise exception 'Marketing post not found'; end if;
  prior_status := current_post.status;
  if next_status = 'approved' and current_post.created_by is not distinct from actor then raise exception 'Independent review required: creator cannot approve this content'; end if;
  allowed := (current_post.status = 'draft' and next_status in ('reviewed','cancelled'))
    or (current_post.status = 'reviewed' and next_status in ('approved','rejected','revision_requested','draft','cancelled'))
    or (current_post.status = 'revision_requested' and next_status in ('reviewed','draft','cancelled'))
    or (current_post.status = 'approved' and next_status in ('scheduled','cancelled','draft'))
    or (current_post.status = 'scheduled' and next_status in ('processing','cancelled','draft'))
    or (current_post.status = 'processing' and next_status in ('published','failed','scheduled'))
    or (current_post.status = 'failed' and next_status in ('scheduled','cancelled','draft'))
    or (current_post.status = 'rejected' and next_status in ('draft','cancelled'));
  if not allowed then raise exception 'Invalid FAST AI post transition from % to %', current_post.status, next_status; end if;
  update public.marketing_posts set status=next_status,
    approved_snapshot=case when next_status='approved' then jsonb_build_object('title',current_post.title,'content',current_post.draft_content,'version',current_post.content_version) else approved_snapshot end,
    content_fingerprint=case when next_status='approved' then md5(jsonb_build_object('title',current_post.title,'content',current_post.draft_content,'version',current_post.content_version)::text) else content_fingerprint end,
    approved_at=case when next_status='approved' then now() else approved_at end, approved_by=case when next_status='approved' then actor else approved_by end,
    rejection_reason=case when next_status='rejected' then nullif(trim(note),'') else rejection_reason end,
    revision_reason=case when next_status='revision_requested' then nullif(trim(note),'') else revision_reason end, updated_by=actor
  where id=target_post_id returning * into current_post;
  insert into public.marketing_approval_events(post_id,event_type,from_status,to_status,reason,snapshot,actor_id)
  values(target_post_id,next_status::text,prior_status,next_status,note,case when next_status='approved' then current_post.approved_snapshot else null end,actor);
  return current_post;
end; $$;
revoke all on function public.transition_marketing_post(uuid, public.marketing_post_status, uuid, text) from public, anon, authenticated;
grant execute on function public.transition_marketing_post(uuid, public.marketing_post_status, uuid, text) to service_role;

-- Preserve hard safety defaults even if a prior manual edit changed them.
update public.automation_settings set foundation_enabled=false, website_campaigns_enabled=false, instagram_publishing_enabled=false, zoho_campaigns_enabled=false, whatsapp_marketing_enabled=false, global_paused=true,
  paused_channels='["instagram","zoho","whatsapp_marketing"]'::jsonb where id=true;
commit;
