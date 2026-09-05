-- Read-only verification after 202609050003_investor_programme_phase2.sql.
-- This script does not create, modify, or delete any production data.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
    'investor_asset_financial_controls',
    'investor_wallets',
    'investor_asset_maintenance_reserves',
    'investor_delivery_settlements',
    'investor_ledger_entries',
    'investor_withdrawal_requests'
  )
order by table_name;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'set_investor_asset_maintenance_reserve',
    'settle_investor_delivery',
    'request_investor_withdrawal',
    'review_investor_withdrawal'
  )
order by routine_name;

select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'investor_wallets',
    'investor_delivery_settlements',
    'investor_ledger_entries',
    'investor_withdrawal_requests'
  )
order by tablename, policyname;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.investor_delivery_settlements'::regclass
  and conname = 'investor_delivery_settlement_split';

select fleet_asset_id, count(*) as active_owner_count
from public.investor_asset_assignments
where ended_at is null
group by fleet_asset_id
having count(*) > 1;
