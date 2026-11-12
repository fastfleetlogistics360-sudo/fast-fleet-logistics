-- FAST AI Phase 1B: governed campaign, content, template and department management.
-- Additive only. It never enables provider execution or changes Phase 1A defaults.

alter type public.marketing_post_status add value if not exists 'revision_requested' after 'reviewed';

create table public.automation_departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  permissions jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id)
);

insert into public.automation_departments (name, description) values
  ('Marketing & Communications', 'Brand, campaign and customer communications planning.'),
  ('Customer Support', 'Customer care and human escalation planning.'),
  ('Dispatch Operations', 'Dispatch and delivery operations planning.'),
  ('Vendor Relations', 'Vendor and marketplace relationship planning.'),
  ('Business Development', 'Growth, partnerships and commercial planning.'),
  ('Administration', 'Governance, approvals and platform administration.')
on conflict (name) do nothing;

alter table public.marketing_campaigns
  add column if not exists description text not null default '' check (char_length(description) <= 3000),
  add column if not exists department_id uuid references public.automation_departments(id) on delete set null,
  add column if not exists proposed_schedule_at timestamptz,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id);

alter table public.marketing_templates
  add column if not exists department_id uuid references public.automation_departments(id) on delete set null,
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id),
  add column if not exists source_template_id uuid references public.marketing_templates(id) on delete set null;

alter table public.marketing_posts
  add column if not exists department_id uuid references public.automation_departments(id) on delete set null,
  add column if not exists title text not null default '' check (char_length(title) <= 240),
  add column if not exists content_version integer not null default 1 check (content_version > 0),
  add column if not exists rejection_reason text,
  add column if not exists revision_reason text;

create table public.marketing_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.marketing_templates(id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  unique(template_id, version)
);

create table public.marketing_content_versions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.marketing_posts(id) on delete cascade,
  version integer not null check (version > 0),
  content jsonb not null,
  title text not null default '',
  reason text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id),
  unique(post_id, version)
);

create index automation_departments_status_idx on public.automation_departments(status, name);
create index marketing_campaigns_department_idx on public.marketing_campaigns(department_id, status, updated_at desc);
create index marketing_templates_department_idx on public.marketing_templates(department_id, status, updated_at desc);
create index marketing_posts_department_idx on public.marketing_posts(department_id, status, updated_at desc);

create trigger automation_departments_touch before update on public.automation_departments for each row execute function public.fast_ai_touch_updated_at();

create or replace function public.fast_ai_protect_post_snapshot() returns trigger language plpgsql as $$
declare approval_invalidated boolean := false;
begin
  if old.approved_snapshot is not null and (new.draft_content is distinct from old.draft_content or new.title is distinct from old.title) then
    approval_invalidated := true;
    new.status := 'draft'; new.approved_snapshot := null; new.content_fingerprint := null; new.approved_at := null; new.approved_by := null;
  end if;
  if old.status is distinct from new.status and not (
    (old.status = 'draft' and new.status in ('reviewed','cancelled')) or
    (old.status = 'reviewed' and new.status in ('approved','rejected','revision_requested','draft','cancelled')) or
    (old.status = 'revision_requested' and new.status in ('reviewed','draft','cancelled')) or
    (old.status = 'approved' and new.status in ('scheduled','cancelled','draft')) or
    (old.status = 'scheduled' and new.status in ('processing','cancelled','draft')) or
    (old.status = 'processing' and new.status in ('published','failed','scheduled')) or
    (old.status = 'failed' and new.status in ('scheduled','cancelled','draft')) or
    (old.status = 'rejected' and new.status in ('draft','cancelled'))
  ) then raise exception 'Invalid FAST AI post transition from % to %', old.status, new.status; end if;
  if not approval_invalidated and old.approved_snapshot is not null and new.approved_snapshot is distinct from old.approved_snapshot then raise exception 'Approved publishing snapshots are immutable'; end if;
  return new;
end; $$;

create or replace function public.transition_marketing_post(target_post_id uuid, next_status public.marketing_post_status, actor uuid, note text default null)
returns public.marketing_posts language plpgsql security definer set search_path = public as $$
declare current_post public.marketing_posts; prior_status public.marketing_post_status; allowed boolean := false;
begin
  select * into current_post from public.marketing_posts where id = target_post_id for update;
  if not found then raise exception 'Marketing post not found'; end if;
  prior_status := current_post.status;
  if next_status = 'approved' and current_post.created_by = actor then raise exception 'Independent review required: creator cannot approve this content'; end if;
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

alter table public.automation_departments enable row level security;
alter table public.marketing_template_versions enable row level security;
alter table public.marketing_content_versions enable row level security;
revoke all on public.automation_departments, public.marketing_template_versions, public.marketing_content_versions from anon, authenticated;
revoke all on function public.transition_marketing_post(uuid, public.marketing_post_status, uuid, text) from public, anon, authenticated;
-- Intentionally no browser policies: admin routes use service-role access after session and permission checks.
