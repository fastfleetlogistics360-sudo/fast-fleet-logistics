-- Local migration only. Apply through the normal Supabase migration process.
-- Bicycle recruitment is a rider-onboarding choice, not a second identity,
-- KYC, wallet, fleet, or payout system.
begin;

alter table public.profiles
  add column if not exists rider_onboarding_path text;

do $$ begin
  alter table public.profiles
    add constraint profiles_rider_onboarding_path_check
    check (rider_onboarding_path is null or rider_onboarding_path in ('standard', 'bicycle_application'));
exception when duplicate_object then null;
end $$;

alter table public.rider_profiles
  add column if not exists onboarding_path text not null default 'standard';

do $$ begin
  alter table public.rider_profiles
    add constraint rider_profiles_onboarding_path_check
    check (onboarding_path in ('standard', 'bicycle_application'));
exception when duplicate_object then null;
end $$;

-- The choice is a server-owned routing fact.  A browser may still update its
-- ordinary profile details, but must not be able to mark itself as a bicycle
-- applicant (or switch back to standard) outside the authenticated routes.
create or replace function public.protect_profile_rider_onboarding_path()
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
    if coalesce(new.rider_onboarding_path, 'standard') <> 'standard' then
      raise exception 'Rider onboarding path can only be changed by FastFleet.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.rider_onboarding_path is distinct from old.rider_onboarding_path then
    raise exception 'Rider onboarding path can only be changed by FastFleet.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protect_rider_onboarding_path on public.profiles;
create trigger profiles_protect_rider_onboarding_path
before insert or update on public.profiles
for each row execute function public.protect_profile_rider_onboarding_path();

create or replace function public.protect_rider_profile_onboarding_path()
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
    if coalesce(new.onboarding_path, 'standard') <> 'standard' then
      raise exception 'Rider onboarding path can only be changed by FastFleet.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.onboarding_path is distinct from old.onboarding_path then
    raise exception 'Rider onboarding path can only be changed by FastFleet.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists rider_profiles_protect_onboarding_path on public.rider_profiles;
create trigger rider_profiles_protect_onboarding_path
before insert or update on public.rider_profiles
for each row execute function public.protect_rider_profile_onboarding_path();

-- Bring historic recruitment records into the existing rider-profile state
-- without modifying an already-established standard rider profile. This
-- preserves past referral records while making legacy applicants reviewable
-- through the same rider state going forward.
insert into public.rider_profiles (
  user_id, application_status, rider_account_type, address, operating_zone,
  vehicle_type, onboarding_path, online, suspension_reason, reviewed_at, reviewed_by
)
select distinct on (application.user_id)
  application.user_id,
  case
    when application.status in ('approved', 'rider_activated') then 'approved'::public.rider_application_status
    when application.status in ('rejected', 'suspended') then 'rejected'::public.rider_application_status
    when application.status in ('screening', 'assessment_invited', 'assessment_passed') then 'under_review'::public.rider_application_status
    else 'submitted'::public.rider_application_status
  end,
  case when application.status in ('approved', 'rider_activated') then 'fastfleets360' else 'independent' end,
  application.residential_area,
  application.preferred_operating_zone,
  'bike'::public.vehicle_type,
  'bicycle_application',
  false,
  application.rejection_reason,
  application.reviewed_at,
  application.reviewed_by
from public.cyclist_applications application
where not exists (select 1 from public.rider_profiles rider where rider.user_id = application.user_id)
order by application.user_id, application.updated_at desc, application.created_at desc
on conflict (user_id) do nothing;

update public.rider_profiles rider
set onboarding_path = 'bicycle_application', updated_at = now()
where rider.rider_account_type = 'fastfleets360'
  and exists (
    select 1 from public.cyclist_applications application
    where application.user_id = rider.user_id and application.status = 'rider_activated'
  );

-- The original referral rollout allowed a browser to create a bare cyclist
-- row. Bicycle applications now have to pass the Rider-authenticated server
-- endpoint, which writes the rider profile and recruitment record together.
drop policy if exists "Users create own cyclist applications" on public.cyclist_applications;
create policy "Cyclist applications are server-mediated" on public.cyclist_applications
  for insert with check (false);

-- Keep the existing recruitment timeline for operations, but write every
-- material decision to the canonical rider KYC fields in the same
-- transaction. That makes a cyclist approval indistinguishable from a rider
-- approval to the wallet, delivery, eligibility, and notification systems.
create or replace function public.transition_cyclist_application(target_application_id uuid, next_status text, note text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  application public.cyclist_applications%rowtype;
  actor_id uuid := auth.uid();
  canonical_status public.rider_application_status;
  rider_id uuid;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can review cyclist applications';
  end if;

  select * into application from public.cyclist_applications where id = target_application_id for update;
  if application.id is null then raise exception 'Cyclist application not found'; end if;

  -- Direct approval is allowed from the Rider Approvals screen. The detailed
  -- screening states remain available to operations, while both routes share
  -- this one canonical decision function.
  if not (
    (application.status = 'submitted' and next_status in ('screening', 'approved', 'rejected', 'withdrawn'))
    or (application.status = 'screening' and next_status in ('assessment_invited', 'approved', 'rejected'))
    or (application.status = 'assessment_invited' and next_status in ('assessment_passed', 'approved', 'rejected'))
    or (application.status = 'assessment_passed' and next_status in ('approved', 'rejected'))
    or (application.status = 'approved' and next_status in ('rider_activated', 'suspended'))
    or (application.status = 'rider_activated' and next_status = 'suspended')
  ) then
    raise exception 'Invalid cyclist application transition';
  end if;
  if next_status = 'rejected' and coalesce(trim(note), '') = '' then
    raise exception 'A rejection reason is required';
  end if;

  update public.cyclist_applications
  set status = next_status,
      reviewed_at = now(),
      reviewed_by = actor_id,
      rejection_reason = case when next_status = 'rejected' then trim(note) else rejection_reason end,
      approved_at = case when next_status = 'approved' then now() else approved_at end,
      rider_activated_at = case when next_status = 'rider_activated' then now() else rider_activated_at end
  where id = application.id;

  canonical_status := case
    when next_status in ('approved', 'rider_activated') then 'approved'::public.rider_application_status
    when next_status = 'rejected' then 'rejected'::public.rider_application_status
    when next_status in ('screening', 'assessment_invited', 'assessment_passed') then 'under_review'::public.rider_application_status
    else 'submitted'::public.rider_application_status
  end;

  update public.rider_profiles
  set application_status = canonical_status,
      rider_account_type = case when canonical_status = 'approved' then 'fastfleets360' else rider_account_type end,
      address = coalesce(address, application.residential_area),
      operating_zone = coalesce(application.preferred_operating_zone, operating_zone),
      -- The rider selected the bicycle path at application submission. This
      -- fallback only repairs historic referral applicants that predate it;
      -- it does not allocate or authorize a bicycle.
      vehicle_type = coalesce(vehicle_type, 'bike'::public.vehicle_type),
      onboarding_path = 'bicycle_application',
      online = case when canonical_status = 'rejected' then false else online end,
      suspension_reason = case when canonical_status = 'rejected' then trim(note) else suspension_reason end,
      reviewed_at = case when next_status in ('approved', 'rejected') then now() else reviewed_at end,
      reviewed_by = case when next_status in ('approved', 'rejected') then actor_id else reviewed_by end,
      updated_at = now()
  where user_id = application.user_id
  returning id into rider_id;

  if rider_id is null then
    insert into public.rider_profiles (
      user_id, application_status, rider_account_type, address, operating_zone,
      vehicle_type, onboarding_path, online, suspension_reason, reviewed_at, reviewed_by
    )
    values (
      application.user_id, canonical_status,
      case when canonical_status = 'approved' then 'fastfleets360' else 'independent' end,
      application.residential_area, application.preferred_operating_zone,
      'bike'::public.vehicle_type, 'bicycle_application', false,
      case when canonical_status = 'rejected' then trim(note) else null end,
      case when next_status in ('approved', 'rejected') then now() else null end,
      case when next_status in ('approved', 'rejected') then actor_id else null end
    )
    returning id into rider_id;
  end if;

  update public.profiles
  set rider_onboarding_path = 'bicycle_application',
      kyc_status = case
        when canonical_status = 'approved' then 'approved'
        when canonical_status = 'rejected' then 'rejected'
        else 'pending_review'
      end,
      updated_at = now()
  where user_id = application.user_id;

  return application.id;
end;
$$;

-- Activation is now tied to the existing fleet-assignment workflow. This RPC
-- retains the historical referral state, but does not invent a bicycle or
-- change the rider's dispatch vehicle as a substitute for an allocation.
create or replace function public.activate_cyclist_rider(target_application_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  application public.cyclist_applications%rowtype;
  rider_id uuid;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can activate cyclist riders';
  end if;
  select * into application from public.cyclist_applications where id = target_application_id for update;
  if application.id is null or application.status <> 'approved' then
    raise exception 'Approve the cyclist application before rider activation';
  end if;
  perform public.transition_cyclist_application(application.id, 'rider_activated');
  select id into rider_id from public.rider_profiles where user_id = application.user_id;
  return rider_id;
end;
$$;

commit;
