-- Investor Programme Phase 2: isolated ledger, maintenance reserve and payouts.
-- Apply only after 202609050000, 202609050001 and 202609050002 have succeeded.
begin;

alter table public.investor_profiles add column if not exists requires_password_setup boolean not null default true;

alter table public.investor_audit_events drop constraint if exists investor_audit_events_event_type_check;
alter table public.investor_audit_events add constraint investor_audit_events_event_type_check check (event_type in (
  'investor_created', 'invitation_sent', 'invitation_resent', 'credentials_reset_requested', 'onboarding_completed', 'investor_suspended', 'investor_reactivated', 'asset_assigned', 'asset_transferred',
  'maintenance_reserve_enabled', 'maintenance_reserve_disabled', 'investor_withdrawal_requested', 'investor_withdrawal_approved', 'investor_withdrawal_rejected', 'investor_withdrawal_paid'
));

create table if not exists public.investor_asset_financial_controls (
  fleet_asset_id uuid primary key references public.fleet_assets(id) on delete restrict,
  maintenance_reserve_enabled boolean not null default false,
  changed_by uuid references public.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  change_reason text,
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_wallets (
  id uuid primary key default gen_random_uuid(),
  investor_profile_id uuid not null unique references public.investor_profiles(id) on delete restrict,
  available_balance_ngn numeric not null default 0 check (available_balance_ngn >= 0),
  locked_balance_ngn numeric not null default 0 check (locked_balance_ngn >= 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_asset_maintenance_reserves (
  fleet_asset_id uuid primary key references public.fleet_assets(id) on delete restrict,
  balance_ngn numeric not null default 0 check (balance_ngn >= 0),
  total_credited_ngn numeric not null default 0 check (total_credited_ngn >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.investor_delivery_settlements (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete restrict,
  fleet_asset_id uuid not null references public.fleet_assets(id) on delete restrict,
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  gross_delivery_value_ngn numeric not null check (gross_delivery_value_ngn > 0),
  rider_share_ngn numeric not null check (rider_share_ngn >= 0),
  owner_share_ngn numeric not null check (owner_share_ngn >= 0),
  company_share_ngn numeric not null check (company_share_ngn >= 0),
  maintenance_reserve_ngn numeric not null default 0 check (maintenance_reserve_ngn >= 0),
  maintenance_reserve_applied boolean not null default false,
  settled_at timestamptz not null default now(),
  constraint investor_delivery_settlement_split check (rider_share_ngn + owner_share_ngn + company_share_ngn + maintenance_reserve_ngn = gross_delivery_value_ngn)
);

create table if not exists public.investor_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  investor_wallet_id uuid not null references public.investor_wallets(id) on delete restrict,
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  fleet_asset_id uuid references public.fleet_assets(id) on delete restrict,
  delivery_settlement_id uuid references public.investor_delivery_settlements(id) on delete restrict,
  withdrawal_request_id uuid,
  entry_type text not null check (entry_type in ('delivery_owner_share', 'withdrawal_hold', 'withdrawal_released', 'withdrawal_paid')),
  amount_ngn numeric not null,
  balance_after_ngn numeric,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.investor_withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  investor_profile_id uuid not null references public.investor_profiles(id) on delete restrict,
  investor_wallet_id uuid not null references public.investor_wallets(id) on delete restrict,
  payout_account_id uuid not null references public.investor_payout_accounts(id) on delete restrict,
  amount_ngn numeric not null check (amount_ngn >= 2000 and amount_ngn <= 200000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  rejection_reason text,
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.investor_ledger_entries drop constraint if exists investor_ledger_entries_withdrawal_fkey;
alter table public.investor_ledger_entries add constraint investor_ledger_entries_withdrawal_fkey foreign key (withdrawal_request_id) references public.investor_withdrawal_requests(id) on delete restrict;

create unique index if not exists investor_ledger_owner_settlement_idx on public.investor_ledger_entries(delivery_settlement_id) where entry_type = 'delivery_owner_share';
create index if not exists investor_settlements_investor_idx on public.investor_delivery_settlements(investor_profile_id, settled_at desc);
create index if not exists investor_settlements_asset_idx on public.investor_delivery_settlements(fleet_asset_id, settled_at desc);
create index if not exists investor_ledger_wallet_idx on public.investor_ledger_entries(investor_wallet_id, created_at desc);
create index if not exists investor_withdrawals_status_idx on public.investor_withdrawal_requests(status, created_at desc);

drop trigger if exists investor_asset_financial_controls_updated_at on public.investor_asset_financial_controls;
create trigger investor_asset_financial_controls_updated_at before update on public.investor_asset_financial_controls for each row execute function public.set_updated_at();
drop trigger if exists investor_wallets_updated_at on public.investor_wallets;
create trigger investor_wallets_updated_at before update on public.investor_wallets for each row execute function public.set_updated_at();
drop trigger if exists investor_withdrawal_requests_updated_at on public.investor_withdrawal_requests;
create trigger investor_withdrawal_requests_updated_at before update on public.investor_withdrawal_requests for each row execute function public.set_updated_at();

create or replace function public.set_investor_asset_maintenance_reserve(target_fleet_asset_id uuid, enabled boolean, actor_user_id uuid, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare target_investor uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Investor financial controls require the trusted admin service' using errcode = '42501'; end if;
  if not exists (select 1 from public.fleet_assets where id = target_fleet_asset_id and asset_type = 'bicycle') then raise exception 'Choose an existing bicycle asset'; end if;
  insert into public.investor_asset_financial_controls(fleet_asset_id, maintenance_reserve_enabled, changed_by, changed_at, change_reason)
  values(target_fleet_asset_id, enabled, actor_user_id, now(), nullif(trim(reason), ''))
  on conflict (fleet_asset_id) do update set maintenance_reserve_enabled = excluded.maintenance_reserve_enabled, changed_by = excluded.changed_by, changed_at = excluded.changed_at, change_reason = excluded.change_reason;
  select investor_profile_id into target_investor from public.investor_asset_assignments where fleet_asset_id = target_fleet_asset_id and ended_at is null;
  if target_investor is not null then insert into public.investor_audit_events(investor_profile_id, fleet_asset_id, actor_user_id, event_type, metadata) values(target_investor, target_fleet_asset_id, actor_user_id, case when enabled then 'maintenance_reserve_enabled' else 'maintenance_reserve_disabled' end, jsonb_build_object('reason', nullif(trim(reason), ''))); end if;
end; $$;

create or replace function public.settle_investor_delivery(target_delivery_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare d public.deliveries%rowtype; assignment public.investor_asset_assignments%rowtype; control_enabled boolean := false; wallet public.investor_wallets%rowtype; settlement public.investor_delivery_settlements%rowtype; gross numeric; rider_share numeric; owner_share numeric; company_share numeric; reserve_share numeric;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Investor settlement requires the trusted service' using errcode = '42501'; end if;
  select * into d from public.deliveries where id = target_delivery_id for update;
  if d.id is null or d.status <> 'delivered' or d.fleet_asset_id is null then return jsonb_build_object('investor_owned', false); end if;
  select * into assignment from public.investor_asset_assignments where fleet_asset_id = d.fleet_asset_id and assigned_at <= coalesce(d.delivered_at, now()) and (ended_at is null or ended_at > coalesce(d.delivered_at, now())) order by assigned_at desc limit 1;
  if assignment.id is null then return jsonb_build_object('investor_owned', false); end if;
  select * into settlement from public.investor_delivery_settlements where delivery_id = d.id;
  if settlement.id is not null then return jsonb_build_object('investor_owned', true, 'rider_share_ngn', settlement.rider_share_ngn, 'owner_share_ngn', settlement.owner_share_ngn, 'maintenance_reserve_ngn', settlement.maintenance_reserve_ngn); end if;
  gross := round(coalesce(nullif(d.metadata ->> 'delivery_fee_ngn', '')::numeric, d.price_ngn, 0), 0);
  if gross <= 0 then return jsonb_build_object('investor_owned', false); end if;
  select maintenance_reserve_enabled into control_enabled from public.investor_asset_financial_controls where fleet_asset_id = d.fleet_asset_id;
  control_enabled := coalesce(control_enabled, false);
  rider_share := round(gross * 0.30, 0); company_share := round(gross * 0.10, 0); reserve_share := case when control_enabled then round(gross * 0.05, 0) else 0 end; owner_share := gross - rider_share - company_share - reserve_share;
  insert into public.investor_wallets(investor_profile_id) values(assignment.investor_profile_id) on conflict(investor_profile_id) do nothing;
  select * into wallet from public.investor_wallets where investor_profile_id = assignment.investor_profile_id for update;
  insert into public.investor_delivery_settlements(delivery_id, fleet_asset_id, investor_profile_id, gross_delivery_value_ngn, rider_share_ngn, owner_share_ngn, company_share_ngn, maintenance_reserve_ngn, maintenance_reserve_applied) values(d.id, d.fleet_asset_id, assignment.investor_profile_id, gross, rider_share, owner_share, company_share, reserve_share, control_enabled) returning * into settlement;
  update public.investor_wallets set available_balance_ngn = available_balance_ngn + owner_share, updated_at = now() where id = wallet.id;
  insert into public.investor_ledger_entries(investor_wallet_id, investor_profile_id, fleet_asset_id, delivery_settlement_id, entry_type, amount_ngn, balance_after_ngn, metadata) values(wallet.id, assignment.investor_profile_id, d.fleet_asset_id, settlement.id, 'delivery_owner_share', owner_share, wallet.available_balance_ngn + owner_share, jsonb_build_object('delivery_id', d.id, 'gross_delivery_value_ngn', gross, 'company_share_ngn', company_share, 'maintenance_reserve_ngn', reserve_share));
  if reserve_share > 0 then insert into public.investor_asset_maintenance_reserves(fleet_asset_id, balance_ngn, total_credited_ngn) values(d.fleet_asset_id, reserve_share, reserve_share) on conflict(fleet_asset_id) do update set balance_ngn = investor_asset_maintenance_reserves.balance_ngn + excluded.balance_ngn, total_credited_ngn = investor_asset_maintenance_reserves.total_credited_ngn + excluded.total_credited_ngn, updated_at = now(); end if;
  return jsonb_build_object('investor_owned', true, 'rider_share_ngn', rider_share, 'owner_share_ngn', owner_share, 'maintenance_reserve_ngn', reserve_share);
end; $$;

create or replace function public.request_investor_withdrawal(target_investor_profile_id uuid, requested_amount_ngn numeric, actor_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare wallet public.investor_wallets%rowtype; payout public.investor_payout_accounts%rowtype; request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Investor withdrawals require the trusted service' using errcode = '42501'; end if;
  if requested_amount_ngn < 2000 or requested_amount_ngn > 200000 then raise exception 'Investor withdrawals must be between NGN 2,000 and NGN 200,000'; end if;
  select * into wallet from public.investor_wallets where investor_profile_id = target_investor_profile_id for update;
  if wallet.id is null or wallet.available_balance_ngn < requested_amount_ngn then raise exception 'Insufficient available investor balance'; end if;
  select * into payout from public.investor_payout_accounts where investor_profile_id = target_investor_profile_id and is_active and verification_status = 'verified' for update;
  if payout.id is null then raise exception 'A verified payout account is required'; end if;
  update public.investor_wallets set available_balance_ngn = available_balance_ngn - requested_amount_ngn, locked_balance_ngn = locked_balance_ngn + requested_amount_ngn, updated_at = now() where id = wallet.id;
  insert into public.investor_withdrawal_requests(investor_profile_id, investor_wallet_id, payout_account_id, amount_ngn) values(target_investor_profile_id, wallet.id, payout.id, requested_amount_ngn) returning id into request_id;
  insert into public.investor_ledger_entries(investor_wallet_id, investor_profile_id, withdrawal_request_id, entry_type, amount_ngn, balance_after_ngn) values(wallet.id, target_investor_profile_id, request_id, 'withdrawal_hold', -requested_amount_ngn, wallet.available_balance_ngn - requested_amount_ngn);
  insert into public.investor_audit_events(investor_profile_id, actor_user_id, event_type, metadata) values(target_investor_profile_id, actor_user_id, 'investor_withdrawal_requested', jsonb_build_object('withdrawal_request_id', request_id, 'amount_ngn', requested_amount_ngn));
  return request_id;
end; $$;

create or replace function public.review_investor_withdrawal(target_request_id uuid, next_status text, actor_user_id uuid, note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare request_row public.investor_withdrawal_requests%rowtype; wallet public.investor_wallets%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Investor withdrawal review requires the trusted admin service' using errcode = '42501'; end if;
  if next_status not in ('approved', 'rejected', 'paid') then raise exception 'Invalid investor withdrawal status'; end if;
  select * into request_row from public.investor_withdrawal_requests where id = target_request_id for update;
  if request_row.id is null or request_row.status in ('rejected', 'paid') then raise exception 'Investor withdrawal cannot be reviewed'; end if;
  if next_status = 'paid' and request_row.status <> 'approved' then raise exception 'Approve the withdrawal before marking it paid'; end if;
  select * into wallet from public.investor_wallets where id = request_row.investor_wallet_id for update;
  if next_status = 'approved' then
    update public.investor_withdrawal_requests set status='approved', reviewed_by=actor_user_id, reviewed_at=now(), rejection_reason=null where id=request_row.id;
  elsif next_status = 'paid' then
    update public.investor_withdrawal_requests set status='paid', reviewed_by=actor_user_id, reviewed_at=coalesce(request_row.reviewed_at, now()), paid_at=now(), rejection_reason=null where id=request_row.id;
    update public.investor_wallets set locked_balance_ngn=greatest(0, locked_balance_ngn-request_row.amount_ngn), updated_at=now() where id=wallet.id;
    insert into public.investor_ledger_entries(investor_wallet_id, investor_profile_id, withdrawal_request_id, entry_type, amount_ngn, balance_after_ngn) values(wallet.id, request_row.investor_profile_id, request_row.id, 'withdrawal_paid', 0, wallet.available_balance_ngn);
  else
    if coalesce(trim(note),'')='' then raise exception 'A rejection reason is required'; end if;
    update public.investor_withdrawal_requests set status='rejected', reviewed_by=actor_user_id, reviewed_at=now(), rejection_reason=trim(note) where id=request_row.id;
    update public.investor_wallets set available_balance_ngn=available_balance_ngn+request_row.amount_ngn, locked_balance_ngn=greatest(0, locked_balance_ngn-request_row.amount_ngn), updated_at=now() where id=wallet.id;
    insert into public.investor_ledger_entries(investor_wallet_id, investor_profile_id, withdrawal_request_id, entry_type, amount_ngn, balance_after_ngn) values(wallet.id, request_row.investor_profile_id, request_row.id, 'withdrawal_released', request_row.amount_ngn, wallet.available_balance_ngn+request_row.amount_ngn);
  end if;
  insert into public.investor_audit_events(investor_profile_id, actor_user_id, event_type, metadata) values(request_row.investor_profile_id, actor_user_id, case when next_status='approved' then 'investor_withdrawal_approved' when next_status='paid' then 'investor_withdrawal_paid' else 'investor_withdrawal_rejected' end, jsonb_build_object('withdrawal_request_id', request_row.id, 'amount_ngn', request_row.amount_ngn, 'note', nullif(trim(note),'')));
  return request_row.id;
end; $$;

revoke all on function public.set_investor_asset_maintenance_reserve(uuid, boolean, uuid, text) from public, anon, authenticated;
revoke all on function public.settle_investor_delivery(uuid) from public, anon, authenticated;
revoke all on function public.request_investor_withdrawal(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.review_investor_withdrawal(uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.set_investor_asset_maintenance_reserve(uuid, boolean, uuid, text) to service_role;
grant execute on function public.settle_investor_delivery(uuid) to service_role;
grant execute on function public.request_investor_withdrawal(uuid, numeric, uuid) to service_role;
grant execute on function public.review_investor_withdrawal(uuid, text, uuid, text) to service_role;

alter table public.investor_asset_financial_controls enable row level security;
alter table public.investor_wallets enable row level security;
alter table public.investor_asset_maintenance_reserves enable row level security;
alter table public.investor_delivery_settlements enable row level security;
alter table public.investor_ledger_entries enable row level security;
alter table public.investor_withdrawal_requests enable row level security;
drop policy if exists "Investors read own investor wallet" on public.investor_wallets;
drop policy if exists "Investors read own settlements" on public.investor_delivery_settlements;
drop policy if exists "Investors read own ledger" on public.investor_ledger_entries;
drop policy if exists "Investors read own withdrawal requests" on public.investor_withdrawal_requests;
create policy "Investors read own investor wallet" on public.investor_wallets for select using (exists (select 1 from public.investor_profiles ip where ip.id=investor_profile_id and ip.user_id=auth.uid()) or public.current_user_role()='admin');
create policy "Investors read own settlements" on public.investor_delivery_settlements for select using (exists (select 1 from public.investor_profiles ip where ip.id=investor_profile_id and ip.user_id=auth.uid()) or public.current_user_role()='admin');
create policy "Investors read own ledger" on public.investor_ledger_entries for select using (exists (select 1 from public.investor_profiles ip where ip.id=investor_profile_id and ip.user_id=auth.uid()) or public.current_user_role()='admin');
create policy "Investors read own withdrawal requests" on public.investor_withdrawal_requests for select using (exists (select 1 from public.investor_profiles ip where ip.id=investor_profile_id and ip.user_id=auth.uid()) or public.current_user_role()='admin');

commit;
