-- Forward repair for databases that applied the initial Refer & Win migration.
-- gen_random_bytes is not available in every Supabase PostgreSQL search path.

begin;

create or replace function public.ensure_referral_code(target_user_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  existing_code text;
  name_stub text;
  candidate text;
begin
  if auth.uid() is not null and auth.uid() <> target_user_id and public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'You can only create your own referral code';
  end if;
  select code into existing_code from public.referral_codes where user_id = target_user_id;
  if existing_code is not null then return existing_code; end if;
  select public.referral_code_for_name(full_name) into name_stub from public.users where id = target_user_id;
  name_stub := trim(both '-' from left(coalesce(nullif(name_stub, ''), 'MEMBER'), 18));
  loop
    candidate := 'FAST-' || name_stub || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.referral_codes(user_id, code) values (target_user_id, candidate);
      return candidate;
    exception when unique_violation then
      select code into existing_code from public.referral_codes where user_id = target_user_id;
      if existing_code is not null then return existing_code; end if;
    end;
  end loop;
end;
$$;

revoke all on function public.ensure_referral_code(uuid) from public;
grant execute on function public.ensure_referral_code(uuid) to authenticated, service_role;

commit;
