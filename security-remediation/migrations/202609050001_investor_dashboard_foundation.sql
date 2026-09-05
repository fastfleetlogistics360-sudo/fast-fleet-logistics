-- Bicycle Asset Dashboard foundation.
-- Additive only: no fleet asset, rider, delivery, or dispatch logic is replaced.
-- Run the investor-dashboard-preflight.sql report and take a backup/PITR marker first.

begin;

-- Investors are provisioned only by server-side admin routes. The Auth-user trigger
-- intentionally continues to treat raw signup metadata as customer/rider/business only.
create table if not exists public.investor_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  investor_code text not null unique check (investor_code ~ '^INV-[A-Z0-9]{6,32}$'),
  status text not null default 'invited' check (status in ('invited', 'onboarding', 'active', 'suspended')),
  invited_at timestamptz not null default now(),
  onboarding_completed_at timestamptz,
  suspended_at timestamptz,
  suspension_reason text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint investor_profile_status_dates check (
    (status = 'suspended' and suspended_at is not null)
    or (status <> 'suspended')
  )
);

create table if not exists public.investor_asset_assignments (
  id uuid primary key default gen_random_uuid(),
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  fleet_asset_id uuid not null references public.fleet_assets(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.users(id) on delete set null,
  ended_at timestamptz,
  ended_by uuid references public.users(id) on delete set null,
  change_reason text,
  created_at timestamptz not null default now(),
  constraint investor_asset_assignment_dates check (ended_at is null or ended_at >= assigned_at)
);

-- Account numbers are encrypted by the application before they reach this table.
-- Browser clients have no direct policy for payout-account rows.
create table if not exists public.investor_payout_accounts (
  id uuid primary key default gen_random_uuid(),
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  bank_name text not null,
  bank_code text not null,
  account_number_ciphertext text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  account_name text not null,
  verification_status text not null default 'verified' check (verification_status in ('verified', 'verification_unavailable', 'replaced')),
  verified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists investor_payout_accounts_one_active_idx
  on public.investor_payout_accounts(investor_profile_id)
  where is_active;

drop trigger if exists investor_payout_accounts_set_updated_at on public.investor_payout_accounts;
create trigger investor_payout_accounts_set_updated_at
before update on public.investor_payout_accounts
for each row execute function public.set_updated_at();

-- One present owner per bicycle. Older, closed rows form the ownership history.
create unique index if not exists investor_asset_assignments_one_active_owner_idx
  on public.investor_asset_assignments(fleet_asset_id)
  where ended_at is null;
create index if not exists investor_asset_assignments_investor_active_idx
  on public.investor_asset_assignments(investor_profile_id, assigned_at desc)
  where ended_at is null;
create index if not exists investor_asset_assignments_asset_history_idx
  on public.investor_asset_assignments(fleet_asset_id, assigned_at desc);

create table if not exists public.investor_audit_events (
  id uuid primary key default gen_random_uuid(),
  investor_profile_id uuid references public.investor_profiles(id) on delete set null,
  fleet_asset_id uuid references public.fleet_assets(id) on delete set null,
  actor_user_id uuid references public.users(id) on delete set null,
  event_type text not null check (event_type in ('investor_created', 'invitation_sent', 'invitation_resent', 'credentials_reset_requested', 'onboarding_completed', 'investor_suspended', 'investor_reactivated', 'asset_assigned', 'asset_transferred')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists investor_audit_events_investor_idx on public.investor_audit_events(investor_profile_id, created_at desc);
create index if not exists investor_audit_events_asset_idx on public.investor_audit_events(fleet_asset_id, created_at desc);

drop trigger if exists investor_profiles_set_updated_at on public.investor_profiles;
create trigger investor_profiles_set_updated_at
before update on public.investor_profiles
for each row execute function public.set_updated_at();

create or replace function public.prevent_investor_assignment_history_rewrite()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Investor asset assignment history cannot be deleted';
  end if;

  if new.investor_profile_id is distinct from old.investor_profile_id
    or new.fleet_asset_id is distinct from old.fleet_asset_id
    or new.assigned_at is distinct from old.assigned_at
    or new.assigned_by is distinct from old.assigned_by then
    raise exception 'Investor asset assignment history cannot be rewritten';
  end if;

  if old.ended_at is not null then
    raise exception 'Closed investor asset assignments cannot be changed';
  end if;

  if new.ended_at is null then
    raise exception 'An active investor asset assignment can only be closed';
  end if;

  return new;
end;
$$;

drop trigger if exists investor_assignment_history_immutable on public.investor_asset_assignments;
create trigger investor_assignment_history_immutable
before update or delete on public.investor_asset_assignments
for each row execute function public.prevent_investor_assignment_history_rewrite();

create or replace function public.assign_investor_asset(
  target_investor_profile_id uuid,
  target_fleet_asset_id uuid,
  actor_user_id uuid,
  reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment_id uuid;
  target_status text;
  target_asset_type text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Investor ownership changes require the trusted admin service' using errcode = '42501';
  end if;

  select status into target_status from public.investor_profiles where id = target_investor_profile_id for update;
  if target_status is null then raise exception 'Investor profile not found'; end if;
  if target_status = 'suspended' then raise exception 'A suspended investor cannot receive a bicycle'; end if;

  select asset_type into target_asset_type from public.fleet_assets where id = target_fleet_asset_id for update;
  if target_asset_type is null or target_asset_type <> 'bicycle' then raise exception 'Only existing bicycle assets can be assigned'; end if;
  if exists (select 1 from public.investor_asset_assignments where fleet_asset_id = target_fleet_asset_id and ended_at is null) then
    raise exception 'This bicycle already has an active investor owner';
  end if;

  insert into public.investor_asset_assignments (investor_profile_id, fleet_asset_id, assigned_by, change_reason)
  values (target_investor_profile_id, target_fleet_asset_id, actor_user_id, nullif(trim(reason), ''))
  returning id into assignment_id;

  insert into public.investor_audit_events (investor_profile_id, fleet_asset_id, actor_user_id, event_type, metadata)
  values (target_investor_profile_id, target_fleet_asset_id, actor_user_id, 'asset_assigned', jsonb_build_object('assignment_id', assignment_id, 'reason', nullif(trim(reason), '')));
  return assignment_id;
end;
$$;

create or replace function public.transfer_investor_asset(
  target_fleet_asset_id uuid,
  next_investor_profile_id uuid,
  actor_user_id uuid,
  reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_assignment public.investor_asset_assignments%rowtype;
  next_status text;
  asset_status text;
  current_delivery uuid;
  next_assignment_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Investor ownership changes require the trusted admin service' using errcode = '42501';
  end if;
  if length(trim(coalesce(reason, ''))) < 4 then raise exception 'A transfer reason is required'; end if;

  select status, current_delivery_id into asset_status, current_delivery from public.fleet_assets where id = target_fleet_asset_id for update;
  if asset_status is null then raise exception 'Bicycle asset not found'; end if;
  if asset_status = 'busy' or current_delivery is not null then raise exception 'Finish or release the current delivery before transferring bicycle ownership'; end if;

  select * into previous_assignment from public.investor_asset_assignments where fleet_asset_id = target_fleet_asset_id and ended_at is null for update;
  if previous_assignment.id is null then raise exception 'This bicycle has no active investor owner to transfer'; end if;
  if previous_assignment.investor_profile_id = next_investor_profile_id then raise exception 'The selected investor already owns this bicycle'; end if;

  select status into next_status from public.investor_profiles where id = next_investor_profile_id for update;
  if next_status is null or next_status = 'suspended' then raise exception 'Choose an active investor account'; end if;

  update public.investor_asset_assignments
  set ended_at = now(), ended_by = actor_user_id, change_reason = trim(reason)
  where id = previous_assignment.id;

  insert into public.investor_asset_assignments (investor_profile_id, fleet_asset_id, assigned_by, change_reason)
  values (next_investor_profile_id, target_fleet_asset_id, actor_user_id, trim(reason))
  returning id into next_assignment_id;

  insert into public.investor_audit_events (investor_profile_id, fleet_asset_id, actor_user_id, event_type, metadata)
  values (next_investor_profile_id, target_fleet_asset_id, actor_user_id, 'asset_transferred', jsonb_build_object('previous_assignment_id', previous_assignment.id, 'assignment_id', next_assignment_id, 'reason', trim(reason)));
  return next_assignment_id;
end;
$$;

revoke all on function public.assign_investor_asset(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.transfer_investor_asset(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_investor_asset(uuid, uuid, uuid, text) to service_role;
grant execute on function public.transfer_investor_asset(uuid, uuid, uuid, text) to service_role;

-- Adding investor must not let a browser self-escalate from customer/rider/business.
create or replace function public.protect_users_privileged_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_request_has_role_admin_privilege() then return new; end if;
  if tg_op = 'INSERT' then
    if new.role in ('admin'::public.user_role, 'investor'::public.user_role) then raise exception 'Privileged role can only be assigned by FastFleet admin.' using errcode = '42501'; end if;
    return new;
  end if;
  if (new.role in ('admin'::public.user_role, 'investor'::public.user_role) and new.role is distinct from old.role)
    or (old.role in ('admin'::public.user_role, 'investor'::public.user_role) and new.role is distinct from old.role) then
    raise exception 'Privileged role can only be changed by FastFleet admin.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.protect_profiles_privileged_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.current_request_has_role_admin_privilege() then return new; end if;
  if tg_op = 'INSERT' then
    if new.account_type in ('admin'::public.user_role, 'investor'::public.user_role) then raise exception 'Privileged account type can only be assigned by FastFleet admin.' using errcode = '42501'; end if;
    if coalesce(new.is_admin, false) or coalesce(new.kyc_status, 'pending_review') <> 'pending_review' then raise exception 'Privileged profile fields can only be assigned by FastFleet admin.' using errcode = '42501'; end if;
    new.is_admin := false; new.kyc_status := 'pending_review'; return new;
  end if;
  if (new.account_type in ('admin'::public.user_role, 'investor'::public.user_role) and new.account_type is distinct from old.account_type)
    or (old.account_type in ('admin'::public.user_role, 'investor'::public.user_role) and new.account_type is distinct from old.account_type)
    or new.is_admin is distinct from old.is_admin
    or new.kyc_status is distinct from old.kyc_status then
    raise exception 'Privileged profile fields can only be changed by FastFleet admin.' using errcode = '42501';
  end if;
  return new;
end;
$$;

alter table public.investor_profiles enable row level security;
alter table public.investor_asset_assignments enable row level security;
alter table public.investor_payout_accounts enable row level security;
alter table public.investor_audit_events enable row level security;

create policy "Investors read own profile" on public.investor_profiles for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');
create policy "Investors read own bicycle assignments" on public.investor_asset_assignments for select
  using (public.current_user_role() = 'admin' or exists (select 1 from public.investor_profiles ip where ip.id = investor_profile_id and ip.user_id = auth.uid()));
create policy "Admins read investor audit events" on public.investor_audit_events for select
  using (public.current_user_role() = 'admin');

drop policy if exists "Users can update own profile" on public.users;
drop policy if exists "Users update own safe fields or admins manage all" on public.users;
create policy "Users can update own profile" on public.users for update
  using (auth.uid() = id or public.current_request_has_role_admin_privilege())
  with check ((auth.uid() = id and role not in ('admin'::public.user_role, 'investor'::public.user_role)) or public.current_request_has_role_admin_privilege());

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile" on public.users for insert
  with check ((auth.uid() = id and role not in ('admin'::public.user_role, 'investor'::public.user_role)) or public.current_request_has_role_admin_privilege());

drop policy if exists "Profiles are inserted by owner" on public.profiles;
create policy "Profiles are inserted by owner" on public.profiles for insert
  with check ((user_id = auth.uid() and id = auth.uid() and account_type not in ('admin'::public.user_role, 'investor'::public.user_role) and coalesce(is_admin, false) = false and coalesce(kyc_status, 'pending_review') = 'pending_review') or public.current_request_has_role_admin_privilege());

drop policy if exists "Profiles are updated by owner" on public.profiles;
create policy "Profiles are updated by owner" on public.profiles for update
  using (user_id = auth.uid() or public.current_request_has_role_admin_privilege())
  with check ((user_id = auth.uid() and account_type not in ('admin'::public.user_role, 'investor'::public.user_role) and coalesce(is_admin, false) = false and coalesce(kyc_status, 'pending_review') = 'pending_review') or public.current_request_has_role_admin_privilege());

commit;
