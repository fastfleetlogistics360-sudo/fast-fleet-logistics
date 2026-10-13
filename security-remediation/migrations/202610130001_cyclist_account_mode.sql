-- Keep cyclist approval and account-mode changes server-owned and atomic.
begin;

create or replace function public.approve_cyclist_application_with_account_mode(
  target_application_id uuid,
  next_rider_account_type text,
  next_independent_bicycle_enabled boolean default false,
  next_operating_zone text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_application public.cyclist_applications%rowtype;
  rider_id uuid;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can approve cyclist applications' using errcode = '42501';
  end if;
  if next_rider_account_type not in ('independent', 'fastfleets360') then
    raise exception 'Invalid rider account type' using errcode = '22023';
  end if;

  select * into target_application
  from public.cyclist_applications
  where id = target_application_id
  for update;
  if target_application.id is null then
    raise exception 'Cyclist application not found' using errcode = 'P0002';
  end if;

  -- The existing transition owns recruitment/KYC status changes. This wrapper
  -- runs in the same transaction, then applies the administrator's explicit
  -- dispatch-account decision before the transaction commits.
  perform public.transition_cyclist_application(target_application.id, 'approved', null);

  update public.rider_profiles
  set rider_account_type = next_rider_account_type,
      independent_bicycle_enabled = next_rider_account_type = 'independent' and next_independent_bicycle_enabled,
      operating_zone = coalesce(nullif(trim(next_operating_zone), ''), operating_zone),
      updated_at = now()
  where user_id = target_application.user_id
    and onboarding_path = 'bicycle_application'
    and application_status = 'approved'
  returning id into rider_id;

  if rider_id is null then
    raise exception 'Approved bicycle rider profile was not found' using errcode = 'P0002';
  end if;
  return rider_id;
end;
$$;

create or replace function public.update_cyclist_rider_account_mode(
  target_rider_profile_id uuid,
  next_rider_account_type text,
  next_independent_bicycle_enabled boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rider_id uuid;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can update cyclist account mode' using errcode = '42501';
  end if;
  if next_rider_account_type not in ('independent', 'fastfleets360') then
    raise exception 'Invalid rider account type' using errcode = '22023';
  end if;

  update public.rider_profiles
  set rider_account_type = next_rider_account_type,
      independent_bicycle_enabled = next_rider_account_type = 'independent' and next_independent_bicycle_enabled,
      updated_at = now()
  where id = target_rider_profile_id
    and onboarding_path = 'bicycle_application'
    and application_status = 'approved'
  returning id into rider_id;

  if rider_id is null then
    raise exception 'Only approved bicycle riders can change account mode' using errcode = 'P0002';
  end if;
  return rider_id;
end;
$$;

revoke all on function public.approve_cyclist_application_with_account_mode(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.update_cyclist_rider_account_mode(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.approve_cyclist_application_with_account_mode(uuid, text, boolean, text) to service_role;
grant execute on function public.update_cyclist_rider_account_mode(uuid, text, boolean) to service_role;

commit;
