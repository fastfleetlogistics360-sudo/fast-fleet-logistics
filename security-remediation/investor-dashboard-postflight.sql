-- Read-only checks after the investor foundation migrations.
select id, user_id, investor_code, status, onboarding_completed_at, suspended_at
from public.investor_profiles
order by created_at desc;

select fleet_asset_id, count(*) as active_owner_count
from public.investor_asset_assignments
where ended_at is null
group by fleet_asset_id
having count(*) > 1;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.deliveries'::regclass
  and conname = 'deliveries_fleet_asset_id_fkey';

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('investor_profiles', 'investor_asset_assignments', 'investor_payout_accounts', 'investor_audit_events')
order by tablename, policyname;
