-- F-001 Role/Admin Self-Escalation Lockdown
-- Purpose:
--   Stop public customer/rider/business flows from assigning admin role, admin account_type,
--   is_admin, or KYC approval fields through Auth metadata, direct browser writes, or owner RLS.
-- Preconditions:
--   1. Run security-remediation/database-preflight.sql and manually review any flagged rows.
--   2. Confirm legitimate admins are already represented by users.role = 'admin' or profiles.is_admin = true.
--   3. Run during a quiet window if public.users or public.profiles are unusually large.
-- Existing-data impact:
--   No rows are deleted or rewritten. Existing admins, users, sessions, orders, wallets, KYC records,
--   and historical records are preserved. Future browser writes to privileged fields are blocked.
-- Locking risk:
--   CREATE OR REPLACE FUNCTION is lightweight. Replacing policies/triggers briefly takes DDL locks on
--   public.users and public.profiles. Expected lock is short on current schema.
-- Rollback:
--   Drop users_protect_privileged_fields and profiles_protect_privileged_fields triggers, drop the three
--   F-001 helper/protection functions, restore the previous handle_new_auth_user body, and restore the
--   previous four users/profiles policies from git commit bb259200e8e0adb3b7d7d0490f381808cc40191a.
-- Verification:
--   Run security-remediation/database-postflight.sql. Also test that customer/rider/business signup still
--   works, while role=admin, account_type=admin, is_admin=true, or kyc_status=approved browser writes fail.

begin;

alter table if exists public.profiles
  add column if not exists is_admin boolean not null default false,
  add column if not exists kyc_status text not null default 'pending_review';

create or replace function public.current_request_has_role_admin_privilege()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select session_user in ('postgres', 'supabase_admin')
    or coalesce(auth.role(), '') = 'service_role'
    or public.current_user_role() = 'admin'
    or public.current_user_is_admin();
$$;

create or replace function public.protect_users_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_request_has_role_admin_privilege() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role = 'admin'::public.user_role then
      raise exception 'Admin role can only be assigned by FastFleet admin.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.role = 'admin'::public.user_role and old.role is distinct from 'admin'::public.user_role then
    raise exception 'Admin role can only be assigned by FastFleet admin.'
      using errcode = '42501';
  end if;

  if old.role = 'admin'::public.user_role and new.role is distinct from old.role then
    raise exception 'Admin role can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_profiles_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_request_has_role_admin_privilege() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.account_type = 'admin'::public.user_role then
      raise exception 'Admin account type can only be assigned by FastFleet admin.'
        using errcode = '42501';
    end if;
    if coalesce(new.is_admin, false) then
      raise exception 'Admin flag can only be assigned by FastFleet admin.'
        using errcode = '42501';
    end if;
    if coalesce(new.kyc_status, 'pending_review') <> 'pending_review' then
      raise exception 'KYC status can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    new.is_admin := false;
    new.kyc_status := 'pending_review';
    return new;
  end if;

  if new.account_type = 'admin'::public.user_role and old.account_type is distinct from 'admin'::public.user_role then
    raise exception 'Admin account type can only be assigned by FastFleet admin.'
      using errcode = '42501';
  end if;

  if old.account_type = 'admin'::public.user_role and new.account_type is distinct from old.account_type then
    raise exception 'Admin account type can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  if new.is_admin is distinct from old.is_admin then
    raise exception 'Admin flag can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  if new.kyc_status is distinct from old.kyc_status then
    raise exception 'KYC status can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists users_protect_privileged_fields on public.users;
create trigger users_protect_privileged_fields
before insert or update on public.users
for each row execute function public.protect_users_privileged_fields();

drop trigger if exists profiles_protect_privileged_fields on public.profiles;
create trigger profiles_protect_privileged_fields
before insert or update on public.profiles
for each row execute function public.protect_profiles_privileged_fields();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_role public.user_role;
begin
  next_role := case
    when new.raw_user_meta_data ->> 'role' in ('customer', 'rider', 'business')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
    when new.raw_user_meta_data ->> 'account_type' in ('customer', 'rider', 'business')
      then (new.raw_user_meta_data ->> 'account_type')::public.user_role
    else 'customer'::public.user_role
  end;

  insert into public.users (id, full_name, phone, email, role, default_zone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone,
    new.email,
    next_role,
    coalesce(new.raw_user_meta_data ->> 'default_zone', new.raw_user_meta_data ->> 'state', 'Lagos')
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    phone = coalesce(excluded.phone, public.users.phone),
    email = coalesce(excluded.email, public.users.email),
    role = excluded.role,
    default_zone = coalesce(excluded.default_zone, public.users.default_zone),
    updated_at = now();

  insert into public.profiles (id, user_id, full_name, phone, email, account_type)
  values (
    new.id,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.phone,
    new.email,
    next_role
  )
  on conflict (id) do update set
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    phone = coalesce(excluded.phone, public.profiles.phone),
    email = coalesce(excluded.email, public.profiles.email),
    account_type = excluded.account_type,
    updated_at = now();

  return new;
end;
$$;

drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id or public.current_request_has_role_admin_privilege())
  with check (
    (auth.uid() = id and role <> 'admin'::public.user_role)
    or public.current_request_has_role_admin_privilege()
  );

drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users for insert
  with check (
    (auth.uid() = id and role <> 'admin'::public.user_role)
    or public.current_request_has_role_admin_privilege()
  );

drop policy if exists "Profiles are inserted by owner" on public.profiles;
create policy "Profiles are inserted by owner"
  on public.profiles for insert
  with check (
    (
      user_id = auth.uid()
      and id = auth.uid()
      and account_type <> 'admin'::public.user_role
      and coalesce(is_admin, false) = false
      and coalesce(kyc_status, 'pending_review') = 'pending_review'
    )
    or public.current_request_has_role_admin_privilege()
  );

drop policy if exists "Profiles are updated by owner" on public.profiles;
create policy "Profiles are updated by owner"
  on public.profiles for update
  using (user_id = auth.uid() or public.current_request_has_role_admin_privilege())
  with check (
    (
      user_id = auth.uid()
      and id = auth.uid()
      and account_type <> 'admin'::public.user_role
      and coalesce(is_admin, false) = false
    )
    or public.current_request_has_role_admin_privilege()
  );

commit;
