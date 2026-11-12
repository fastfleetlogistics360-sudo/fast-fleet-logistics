-- FAST AI Phase 1A: durable, disabled-by-default automation foundation.
-- This migration creates no provider credentials and does not enable any job.

create type public.marketing_post_status as enum ('draft','reviewed','approved','scheduled','processing','published','rejected','failed','cancelled');
create type public.marketing_job_status as enum ('pending','processing','retrying','completed','dead_letter','cancelled');
create type public.automation_permission_role as enum ('viewer','operator','approver','super_admin');

create table public.automation_settings (
  id boolean primary key default true check (id),
  foundation_enabled boolean not null default false,
  website_campaigns_enabled boolean not null default false,
  instagram_publishing_enabled boolean not null default false,
  zoho_campaigns_enabled boolean not null default false,
  whatsapp_marketing_enabled boolean not null default false,
  global_paused boolean not null default true,
  paused_channels jsonb not null default '["instagram","zoho","whatsapp_marketing"]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.automation_settings (id) values (true) on conflict (id) do nothing;

create table public.automation_admin_permissions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.automation_permission_role not null default 'viewer',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table public.publishing_accounts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('instagram','zoho_campaigns')),
  account_label text not null check (char_length(trim(account_label)) between 1 and 160),
  external_account_id text,
  credential_secret_ref text,
  credential_expires_at timestamptz,
  scopes jsonb not null default '[]'::jsonb,
  status text not null default 'not_connected' check (status in ('not_connected','pending_authorization','connected','expired','revoked','error')),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  unique(provider, external_account_id)
);
comment on column public.publishing_accounts.credential_secret_ref is 'Only an opaque managed-secret reference is permitted; no OAuth token is stored in this database.';

create table public.marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 160),
  channel text not null check (channel in ('website','instagram','zoho_email','whatsapp_marketing')),
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  unique(name, version)
);

create table public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 180),
  objective text not null check (char_length(trim(objective)) between 1 and 300),
  channel text not null check (channel in ('website','instagram','zoho_email','whatsapp_marketing')),
  status text not null default 'draft' check (status in ('draft','active','paused','completed','cancelled')),
  starts_at timestamptz, ends_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

create table public.marketing_posts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  template_id uuid references public.marketing_templates(id) on delete set null,
  publishing_account_id uuid references public.publishing_accounts(id) on delete set null,
  channel text not null check (channel in ('website','instagram','zoho_email','whatsapp_marketing')),
  status public.marketing_post_status not null default 'draft',
  draft_content jsonb not null default '{}'::jsonb,
  approved_snapshot jsonb,
  content_fingerprint text,
  scheduled_for timestamptz,
  provider_publish_id text,
  published_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id),
  approved_at timestamptz, approved_by uuid references auth.users(id),
  check ((status not in ('approved','scheduled','processing','published')) or approved_snapshot is not null),
  unique(publishing_account_id, provider_publish_id)
);

create table public.marketing_approval_events (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketing_posts(id) on delete cascade,
  event_type text not null check (event_type in ('created','reviewed','approved','rejected','scheduled','processing','published','failed','cancelled','approval_invalidated','retry_requested','pause_changed')),
  from_status public.marketing_post_status,
  to_status public.marketing_post_status,
  reason text,
  snapshot jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.marketing_audience_snapshots (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  audience_rule jsonb not null default '{}'::jsonb,
  recipient_count integer not null default 0 check (recipient_count >= 0),
  recipient_fingerprint text not null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  unique(campaign_id, recipient_fingerprint)
);

create table public.marketing_job_outbox (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketing_posts(id) on delete cascade,
  channel text not null check (channel in ('website','instagram','zoho_email','whatsapp_marketing')),
  idempotency_key text not null unique,
  status public.marketing_job_status not null default 'pending',
  run_after timestamptz not null default now(),
  locked_at timestamptz, locked_by text, attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 12),
  last_error_code text, last_error_message text, completed_at timestamptz, cancelled_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id), updated_at timestamptz not null default now()
);

create table public.publishing_logs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references public.marketing_job_outbox(id) on delete set null,
  post_id uuid references public.marketing_posts(id) on delete set null,
  provider text not null check (provider in ('instagram','zoho_campaigns','website','whatsapp_marketing')),
  event_type text not null, outcome text not null check (outcome in ('skipped','success','retryable_failure','permanent_failure')),
  provider_reference text, response_code integer, detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(provider, provider_reference, event_type)
);

create table public.communication_logs (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('website','instagram','zoho_email','whatsapp_marketing')),
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  post_id uuid references public.marketing_posts(id) on delete set null,
  recipient_fingerprint text,
  event_type text not null, provider_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.provider_webhook_receipts (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('instagram','zoho_campaigns')),
  event_key text not null,
  payload_digest text not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(), processed_at timestamptz,
  unique(provider, event_key), unique(provider, payload_digest)
);

create index marketing_posts_status_schedule_idx on public.marketing_posts(status, scheduled_for);
create index marketing_jobs_ready_idx on public.marketing_job_outbox(status, run_after) where status in ('pending','retrying');
create index marketing_jobs_lock_idx on public.marketing_job_outbox(status, locked_at) where status = 'processing';
create index marketing_approval_events_post_idx on public.marketing_approval_events(post_id, created_at desc);
create index publishing_logs_post_idx on public.publishing_logs(post_id, created_at desc);
create index communication_logs_campaign_idx on public.communication_logs(campaign_id, created_at desc);

create or replace function public.fast_ai_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
create trigger automation_settings_touch before update on public.automation_settings for each row execute function public.fast_ai_touch_updated_at();
create trigger automation_permissions_touch before update on public.automation_admin_permissions for each row execute function public.fast_ai_touch_updated_at();
create trigger publishing_accounts_touch before update on public.publishing_accounts for each row execute function public.fast_ai_touch_updated_at();
create trigger marketing_templates_touch before update on public.marketing_templates for each row execute function public.fast_ai_touch_updated_at();
create trigger marketing_campaigns_touch before update on public.marketing_campaigns for each row execute function public.fast_ai_touch_updated_at();
create trigger marketing_posts_touch before update on public.marketing_posts for each row execute function public.fast_ai_touch_updated_at();
create trigger marketing_jobs_touch before update on public.marketing_job_outbox for each row execute function public.fast_ai_touch_updated_at();

create or replace function public.fast_ai_protect_post_snapshot() returns trigger language plpgsql as $$
declare approval_invalidated boolean := false;
begin
  if old.approved_snapshot is not null and new.draft_content is distinct from old.draft_content then
    approval_invalidated := true;
    new.status := 'draft'; new.approved_snapshot := null; new.content_fingerprint := null; new.approved_at := null; new.approved_by := null;
  end if;
  if old.status is distinct from new.status and not (
    (old.status = 'draft' and new.status in ('reviewed','cancelled')) or
    (old.status = 'reviewed' and new.status in ('approved','rejected','draft','cancelled')) or
    (old.status = 'approved' and new.status in ('scheduled','cancelled','draft')) or
    (old.status = 'scheduled' and new.status in ('processing','cancelled','draft')) or
    (old.status = 'processing' and new.status in ('published','failed','scheduled')) or
    (old.status = 'failed' and new.status in ('scheduled','cancelled','draft')) or
    (old.status = 'rejected' and new.status in ('draft','cancelled'))
  ) then raise exception 'Invalid FAST AI post transition from % to %', old.status, new.status; end if;
  if not approval_invalidated and old.approved_snapshot is not null and new.approved_snapshot is distinct from old.approved_snapshot then raise exception 'Approved publishing snapshots are immutable'; end if;
  return new;
end; $$;
create trigger marketing_posts_snapshot_protection before update on public.marketing_posts for each row execute function public.fast_ai_protect_post_snapshot();

create or replace function public.fast_ai_audit_approval_invalidation() returns trigger language plpgsql as $$
begin
  if old.approved_snapshot is not null and new.approved_snapshot is null and new.status = 'draft' then
    insert into public.marketing_approval_events(post_id, event_type, from_status, to_status, reason, actor_id)
    values(new.id, 'approval_invalidated', old.status, new.status, 'Approved content changed and requires a fresh review.', new.updated_by);
  end if;
  return new;
end; $$;
create trigger marketing_posts_approval_invalidation_audit after update on public.marketing_posts for each row execute function public.fast_ai_audit_approval_invalidation();

create or replace function public.transition_marketing_post(target_post_id uuid, next_status public.marketing_post_status, actor uuid, note text default null)
returns public.marketing_posts language plpgsql security definer set search_path = public as $$
declare current_post public.marketing_posts; prior_status public.marketing_post_status; allowed boolean := false;
begin
  select * into current_post from public.marketing_posts where id = target_post_id for update;
  if not found then raise exception 'Marketing post not found'; end if;
  prior_status := current_post.status;
  allowed := (current_post.status = 'draft' and next_status in ('reviewed','cancelled'))
    or (current_post.status = 'reviewed' and next_status in ('approved','rejected','draft','cancelled'))
    or (current_post.status = 'approved' and next_status in ('scheduled','cancelled','draft'))
    or (current_post.status = 'scheduled' and next_status in ('processing','cancelled','draft'))
    or (current_post.status = 'processing' and next_status in ('published','failed','scheduled'))
    or (current_post.status = 'failed' and next_status in ('scheduled','cancelled','draft'))
    or (current_post.status = 'rejected' and next_status in ('draft','cancelled'));
  if not allowed then raise exception 'Invalid FAST AI post transition from % to %', current_post.status, next_status; end if;
  update public.marketing_posts set status = next_status, approved_snapshot = case when next_status = 'approved' then current_post.draft_content else approved_snapshot end,
    content_fingerprint = case when next_status = 'approved' then md5(current_post.draft_content::text) else content_fingerprint end,
    approved_at = case when next_status = 'approved' then now() else approved_at end, approved_by = case when next_status = 'approved' then actor else approved_by end, updated_by = actor where id = target_post_id returning * into current_post;
  insert into public.marketing_approval_events(post_id,event_type,from_status,to_status,reason,snapshot,actor_id) values(target_post_id,next_status::text,prior_status,next_status,note,case when next_status='approved' then current_post.approved_snapshot else null end,actor);
  return current_post;
end; $$;

create or replace function public.claim_fast_ai_jobs(worker_id text, max_jobs integer default 10)
returns setof public.marketing_job_outbox language sql security definer set search_path = public as $$
  with chosen as (select id from public.marketing_job_outbox where status in ('pending','retrying') and run_after <= now() and (locked_at is null or locked_at < now() - interval '10 minutes') order by run_after asc for update skip locked limit greatest(1, least(max_jobs, 25)))
  update public.marketing_job_outbox j set status='processing', locked_at=now(), locked_by=worker_id, attempt_count=j.attempt_count+1 from chosen where j.id=chosen.id returning j.*;
$$;

revoke all on function public.transition_marketing_post(uuid, public.marketing_post_status, uuid, text) from public, anon, authenticated;
revoke all on function public.claim_fast_ai_jobs(text, integer) from public, anon, authenticated;

alter table public.automation_settings enable row level security;
alter table public.automation_admin_permissions enable row level security;
alter table public.publishing_accounts enable row level security;
alter table public.marketing_templates enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_posts enable row level security;
alter table public.marketing_approval_events enable row level security;
alter table public.marketing_audience_snapshots enable row level security;
alter table public.marketing_job_outbox enable row level security;
alter table public.publishing_logs enable row level security;
alter table public.communication_logs enable row level security;
alter table public.provider_webhook_receipts enable row level security;
-- Intentionally no browser policies: all Phase 1A access is mediated by server-side admin routes.
