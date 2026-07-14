-- F-001 postflight checks. Read-only.
-- Run after security-remediation/migrations/202607140001_f001_role_admin_lockdown.sql.
-- Expected result: helper functions/triggers/policies are present, and handle_new_auth_user
-- accepts only customer/rider/business from raw user metadata.

select
  'required_functions' as check_name,
  count(*) filter (where proname = 'current_request_has_role_admin_privilege') as has_privilege_helper,
  count(*) filter (where proname = 'protect_users_privileged_fields') as has_users_trigger_function,
  count(*) filter (where proname = 'protect_profiles_privileged_fields') as has_profiles_trigger_function,
  count(*) filter (where proname = 'protect_rider_application_review_fields') as has_rider_application_review_function,
  count(*) filter (where proname = 'protect_business_profile_review_fields') as has_business_profile_review_function
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'current_request_has_role_admin_privilege',
    'protect_users_privileged_fields',
    'protect_profiles_privileged_fields',
    'protect_rider_application_review_fields',
    'protect_business_profile_review_fields'
  );

select
  'required_triggers' as check_name,
  count(*) filter (where tgname = 'users_protect_privileged_fields') as has_users_trigger,
  count(*) filter (where tgname = 'profiles_protect_privileged_fields') as has_profiles_trigger,
  count(*) filter (where tgname = 'rider_applications_protect_review_fields') as has_rider_application_review_trigger,
  count(*) filter (where tgname = 'business_profiles_protect_review_fields') as has_business_profile_review_trigger
from pg_trigger
where tgname in (
  'users_protect_privileged_fields',
  'profiles_protect_privileged_fields',
  'rider_applications_protect_review_fields',
  'business_profiles_protect_review_fields'
);

select
  'rls_enabled' as check_name,
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('users', 'profiles', 'rider_applications', 'business_profiles', 'platform_settings')
order by c.relname;

select
  'f001_profile_columns' as check_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name in ('is_admin', 'kyc_status')
order by column_name;

select
  'required_policies' as check_name,
  tablename,
  policyname,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'profiles')
  and policyname in (
    'Users can update own profile',
    'Users can insert own profile',
    'Profiles are inserted by owner',
    'Profiles are updated by owner'
  )
order by tablename, policyname;

select
  'handle_new_auth_user_source' as check_name,
  position('customer'', ''rider'', ''business'', ''admin' in pg_get_functiondef('public.handle_new_auth_user()'::regprocedure)) as legacy_admin_allowlist_position,
  position('raw_user_meta_data ->> ''role'' in (''customer'', ''rider'', ''business'')' in pg_get_functiondef('public.handle_new_auth_user()'::regprocedure)) as role_allowlist_position,
  position('raw_user_meta_data ->> ''account_type'' in (''customer'', ''rider'', ''business'')' in pg_get_functiondef('public.handle_new_auth_user()'::regprocedure)) as account_type_allowlist_position;

select
  'staging_marker' as check_name,
  key,
  value ->> 'environment' as environment,
  (value ->> 'allow_f001_tests')::boolean as allow_f001_tests
from public.platform_settings
where key = 'f001_staging_validation_marker';

select
  'manual_browser_write_tests' as check_name,
  'Use a non-admin authenticated session to verify users.role=admin, profiles.account_type=admin, profiles.is_admin=true, and profiles.kyc_status=approved are rejected with SQLSTATE 42501.' as instruction;

select
  'normal_role_flow_tests' as check_name,
  'Verify customer, rider, and business signup/login still create or update public.users and public.profiles without changing existing orders, wallets, KYC, or sessions.' as instruction;
