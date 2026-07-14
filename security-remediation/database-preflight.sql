-- F-001 preflight checks. Read-only.
-- Run before security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql.
-- Review all rows returned from the *_review queries before applying the migration.

select
  'users_by_role' as check_name,
  role::text as value,
  count(*) as row_count
from public.users
group by role
order by role::text;

select
  'profiles_by_account_type' as check_name,
  account_type::text as value,
  count(*) as row_count
from public.profiles
group by account_type
order by account_type::text;

select
  'unexpected_profile_account_type_review' as check_name,
  user_id,
  email,
  account_type::text as account_type
from public.profiles
where account_type::text not in ('customer', 'rider', 'business', 'admin')
order by email nulls last, user_id;

select
  'admin_flags' as check_name,
  count(*) filter (where u.role = 'admin') as users_role_admin,
  count(*) filter (where p.account_type = 'admin') as profiles_account_type_admin,
  count(*) filter (where coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) = true) as profiles_is_admin
from public.users u
full join public.profiles p on p.user_id = u.id;

select
  'role_profile_mismatch_review' as check_name,
  u.id,
  u.email,
  u.role::text as users_role,
  p.account_type::text as profiles_account_type,
  coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) as is_admin,
  coalesce(to_jsonb(p) ->> 'kyc_status', 'pending_review') as kyc_status
from public.users u
join public.profiles p on p.user_id = u.id
where u.role is distinct from p.account_type
order by u.email nulls last, u.id;

select
  'admin_review' as check_name,
  coalesce(u.id, p.user_id) as user_id,
  coalesce(u.email, p.email) as email,
  u.role::text as users_role,
  p.account_type::text as profiles_account_type,
  coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) as is_admin,
  coalesce(to_jsonb(p) ->> 'kyc_status', 'pending_review') as kyc_status,
  p.updated_at
from public.users u
full join public.profiles p on p.user_id = u.id
where u.role = 'admin'
   or p.account_type = 'admin'
   or coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) = true
order by email nulls last, user_id;

select
  'self_approved_profile_kyc_review' as check_name,
  p.user_id,
  p.email,
  p.account_type::text as account_type,
  coalesce((to_jsonb(p) ->> 'is_admin')::boolean, false) as is_admin,
  coalesce(to_jsonb(p) ->> 'kyc_status', 'pending_review') as kyc_status,
  p.updated_at
from public.profiles p
where coalesce(to_jsonb(p) ->> 'kyc_status', 'pending_review') is distinct from 'pending_review'
order by p.updated_at desc nulls last, p.user_id;

select
  'orphan_profiles_review' as check_name,
  p.user_id,
  p.email,
  p.account_type::text as account_type,
  p.created_at
from public.profiles p
left join public.users u on u.id = p.user_id
where u.id is null
order by p.created_at desc nulls last;

select
  'duplicate_profiles_review' as check_name,
  user_id,
  count(*) as profile_count,
  array_agg(id order by created_at) as profile_ids
from public.profiles
group by user_id
having count(*) > 1
order by profile_count desc, user_id;

select
  'missing_profiles_review' as check_name,
  u.id,
  u.email,
  u.role::text as role,
  u.created_at
from public.users u
left join public.profiles p on p.user_id = u.id
where p.user_id is null
order by u.created_at desc nulls last;

select
  'existing_role_lockdown_objects' as check_name,
  count(*) filter (where proname = 'current_request_has_role_admin_privilege') as has_privilege_helper,
  count(*) filter (where proname = 'protect_users_privileged_fields') as has_users_trigger_function,
  count(*) filter (where proname = 'protect_profiles_privileged_fields') as has_profiles_trigger_function
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'current_request_has_role_admin_privilege',
    'protect_users_privileged_fields',
    'protect_profiles_privileged_fields'
  );

select
  'existing_role_lockdown_triggers' as check_name,
  count(*) filter (where tgname = 'users_protect_privileged_fields') as has_users_trigger,
  count(*) filter (where tgname = 'profiles_protect_privileged_fields') as has_profiles_trigger
from pg_trigger
where tgname in ('users_protect_privileged_fields', 'profiles_protect_privileged_fields');

with expected(object_type, object_name, actual_regtype, actual_regclass, actual_regprocedure) as (
  values
    ('type', 'public.user_role', to_regtype('public.user_role'), null::regclass, null::regprocedure),
    ('table', 'public.users', null::regtype, to_regclass('public.users'), null::regprocedure),
    ('table', 'public.profiles', null::regtype, to_regclass('public.profiles'), null::regprocedure),
    ('table', 'public.rider_applications', null::regtype, to_regclass('public.rider_applications'), null::regprocedure),
    ('table', 'public.business_profiles', null::regtype, to_regclass('public.business_profiles'), null::regprocedure),
    ('table', 'public.platform_settings', null::regtype, to_regclass('public.platform_settings'), null::regprocedure),
    ('function', 'public.current_user_role()', null::regtype, null::regclass, to_regprocedure('public.current_user_role()')),
    ('function', 'public.current_user_is_admin()', null::regtype, null::regclass, to_regprocedure('public.current_user_is_admin()')),
    ('function', 'public.handle_new_auth_user()', null::regtype, null::regclass, to_regprocedure('public.handle_new_auth_user()')),
    ('function', 'public.protect_rider_application_review_fields()', null::regtype, null::regclass, to_regprocedure('public.protect_rider_application_review_fields()')),
    ('function', 'public.protect_business_profile_review_fields()', null::regtype, null::regclass, to_regprocedure('public.protect_business_profile_review_fields()'))
)
select
  'required_schema_objects' as check_name,
  object_type,
  object_name,
  coalesce(actual_regtype::text, actual_regclass::text, actual_regprocedure::text) is not null as is_present
from expected
order by object_type, object_name;

select
  'required_schema_columns' as check_name,
  expected.table_name,
  expected.column_name,
  columns.data_type,
  columns.udt_name,
  columns.is_nullable,
  case
    when expected.table_name = 'profiles' and expected.column_name in ('is_admin', 'kyc_status')
      then false
    else true
  end as required_before_migration,
  case
    when expected.table_name = 'profiles' and expected.column_name in ('is_admin', 'kyc_status')
      then 'added_by_f001_migration'
    else 'required_preexisting_schema'
  end as expectation,
  columns.column_name is not null as is_present
from (
  values
    ('users', 'id'),
    ('users', 'email'),
    ('users', 'phone'),
    ('users', 'full_name'),
    ('users', 'role'),
    ('users', 'default_zone'),
    ('users', 'updated_at'),
    ('profiles', 'id'),
    ('profiles', 'user_id'),
    ('profiles', 'email'),
    ('profiles', 'phone'),
    ('profiles', 'full_name'),
    ('profiles', 'account_type'),
    ('profiles', 'is_admin'),
    ('profiles', 'kyc_status'),
    ('profiles', 'lga'),
    ('profiles', 'avatar_url'),
    ('profiles', 'updated_at'),
    ('rider_applications', 'id'),
    ('rider_applications', 'user_id'),
    ('rider_applications', 'status'),
    ('rider_applications', 'reviewed_by'),
    ('rider_applications', 'reviewed_at'),
    ('business_profiles', 'id'),
    ('business_profiles', 'user_id'),
    ('business_profiles', 'registration_status'),
    ('business_profiles', 'reviewed_by'),
    ('business_profiles', 'reviewed_at'),
    ('platform_settings', 'key'),
    ('platform_settings', 'value')
) as expected(table_name, column_name)
left join information_schema.columns columns
  on columns.table_schema = 'public'
 and columns.table_name = expected.table_name
 and columns.column_name = expected.column_name
order by expected.table_name, expected.column_name;

select
  'existing_policy_review' as check_name,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'profiles', 'rider_applications', 'business_profiles')
order by tablename, policyname;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'auth' and table_name = 'users') then
    raise notice 'Optional check: inspect auth.users raw_user_meta_data for role/account_type admin/staff/super_admin values if your Supabase SQL editor permits auth schema access.';
  end if;
end $$;
