-- FastFleet KYC self-approval hardening.
-- Run this once in the Supabase SQL editor for existing projects.

alter table if exists public.business_profiles
  add column if not exists reviewed_by uuid references public.users(id);

create or replace function public.current_request_has_kyc_review_privilege()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.role(), '') = 'service_role'
    or public.current_user_role() = 'admin'
    or public.current_user_is_admin();
$$;

create or replace function public.protect_business_profile_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_request_has_kyc_review_privilege() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.registration_status, 'submitted') <> 'submitted' then
      raise exception 'Business approval status can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    if new.reviewed_at is not null or new.reviewed_by is not null or new.rejection_reason is not null then
      raise exception 'Business review fields can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    new.registration_status := 'submitted';
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;
    return new;
  end if;

  if new.registration_status is distinct from old.registration_status
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Business review fields can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_rider_profile_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_request_has_kyc_review_privilege() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.application_status, 'submitted'::public.rider_application_status) <> 'submitted'::public.rider_application_status then
      raise exception 'Rider approval status can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    if new.reviewed_at is not null or new.reviewed_by is not null or new.suspension_reason is not null then
      raise exception 'Rider review fields can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    new.application_status := 'submitted'::public.rider_application_status;
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.suspension_reason := null;
    return new;
  end if;

  if new.application_status is distinct from old.application_status
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.suspension_reason is distinct from old.suspension_reason then
    raise exception 'Rider review fields can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.protect_rider_application_review_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_request_has_kyc_review_privilege() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.status, 'pending_review') not in ('pending_review', 'submitted') then
      raise exception 'Rider application approval status can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    if new.reviewed_at is not null or new.reviewed_by is not null or new.rejection_reason is not null then
      raise exception 'Rider application review fields can only be changed by FastFleet admin.'
        using errcode = '42501';
    end if;
    new.status := coalesce(new.status, 'pending_review');
    new.reviewed_at := null;
    new.reviewed_by := null;
    new.rejection_reason := null;
    return new;
  end if;

  if new.status is distinct from old.status
    or new.reviewed_at is distinct from old.reviewed_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.rejection_reason is distinct from old.rejection_reason then
    raise exception 'Rider application review fields can only be changed by FastFleet admin.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists business_profiles_protect_review_fields on public.business_profiles;
create trigger business_profiles_protect_review_fields
before insert or update on public.business_profiles
for each row execute function public.protect_business_profile_review_fields();

drop trigger if exists rider_profiles_protect_review_fields on public.rider_profiles;
create trigger rider_profiles_protect_review_fields
before insert or update on public.rider_profiles
for each row execute function public.protect_rider_profile_review_fields();

drop trigger if exists rider_applications_protect_review_fields on public.rider_applications;
create trigger rider_applications_protect_review_fields
before insert or update on public.rider_applications
for each row execute function public.protect_rider_application_review_fields();

drop policy if exists "Riders manage own rider profile and admins manage all" on public.rider_profiles;
drop policy if exists "Rider profiles readable by owner and admins" on public.rider_profiles;
drop policy if exists "Riders insert own safe rider profile and admins manage all" on public.rider_profiles;
drop policy if exists "Riders update own safe rider profile and admins manage all" on public.rider_profiles;
drop policy if exists "Admins delete rider profiles" on public.rider_profiles;

create policy "Rider profiles readable by owner and admins"
  on public.rider_profiles for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Riders insert own safe rider profile and admins manage all"
  on public.rider_profiles for insert
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Riders update own safe rider profile and admins manage all"
  on public.rider_profiles for update
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Admins delete rider profiles"
  on public.rider_profiles for delete
  using (public.current_user_role() = 'admin');

drop policy if exists "Riders create own applications" on public.rider_applications;
create policy "Riders create own applications"
  on public.rider_applications for insert
  with check (
    public.current_user_is_admin()
    or (
      user_id = auth.uid()
      and status in ('pending_review', 'submitted')
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null
    )
  );

drop policy if exists "Rider applications updated by owner before review or admins" on public.rider_applications;
create policy "Rider applications updated by owner before review or admins"
  on public.rider_applications for update
  using (public.current_user_is_admin() or (user_id = auth.uid() and status in ('pending_review', 'submitted')))
  with check (
    public.current_user_is_admin()
    or (
      user_id = auth.uid()
      and status in ('pending_review', 'submitted')
      and reviewed_by is null
      and reviewed_at is null
      and rejection_reason is null
    )
  );

drop policy if exists "Businesses manage own business profile and admins manage all" on public.business_profiles;
drop policy if exists "Business profiles readable by owner and admins" on public.business_profiles;
drop policy if exists "Businesses insert own safe business profile and admins manage all" on public.business_profiles;
drop policy if exists "Businesses update own safe business profile and admins manage all" on public.business_profiles;
drop policy if exists "Admins delete business profiles" on public.business_profiles;

create policy "Business profiles readable by owner and admins"
  on public.business_profiles for select
  using (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Businesses insert own safe business profile and admins manage all"
  on public.business_profiles for insert
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Businesses update own safe business profile and admins manage all"
  on public.business_profiles for update
  using (user_id = auth.uid() or public.current_user_role() = 'admin')
  with check (user_id = auth.uid() or public.current_user_role() = 'admin');

create policy "Admins delete business profiles"
  on public.business_profiles for delete
  using (public.current_user_role() = 'admin');
