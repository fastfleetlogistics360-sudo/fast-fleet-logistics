-- Fast Fleets 360: one-time sandbox loyalty-credit cutover.
-- Run this migration only after backing up production and after all active
-- sandbox work has been drained. It is intentionally separate from the full
-- schema so it can be reviewed and rolled back before LIVE credentials are set.
-- Prerequisites: supabase-schema.sql, supabase-payment-webhook-reconciliation-delta.sql,
-- and supabase-fasterrands-delta.sql must already be installed.

begin;

alter table public.wallets
  add column if not exists loyalty_credit_ngn numeric not null default 0 check (loyalty_credit_ngn >= 0),
  add column if not exists loyalty_credit_initial_ngn numeric not null default 0 check (loyalty_credit_initial_ngn >= 0),
  add column if not exists loyalty_credit_exhausted_at timestamptz,
  add column if not exists loyalty_credit_migrated_at timestamptz;

create table if not exists public.wallet_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  entry_type text not null check (entry_type in ('sandbox_conversion', 'platform_fee_spend', 'exhausted')),
  amount_ngn numeric not null check (amount_ngn >= 0),
  balance_after_ngn numeric not null check (balance_after_ngn >= 0),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_loyalty_ledger_wallet_idx
  on public.wallet_loyalty_ledger(wallet_id, created_at desc);

alter table public.wallet_loyalty_ledger enable row level security;
drop policy if exists "Wallet owners and admins read loyalty ledger" on public.wallet_loyalty_ledger;
create policy "Wallet owners and admins read loyalty ledger"
  on public.wallet_loyalty_ledger for select
  using (
    exists (select 1 from public.wallets w where w.id = wallet_id and w.user_id = auth.uid())
    or public.current_user_role() = 'admin'
  );

-- Convert the current customer/business wallet balance at a single cutover
-- point. The operation is idempotent and deliberately excludes rider and
-- investor ledgers. One thousand sandbox naira becomes one hundred loyalty
-- naira (10:1), with no cash remainder.
create or replace function public.convert_sandbox_wallet_balances(next_reference text)
returns table(converted_wallets integer, converted_source_ngn numeric, converted_credit_ngn numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet_row public.wallets%rowtype;
  source_amount numeric;
  credit_amount numeric;
  converted_count integer := 0;
  source_total numeric := 0;
  credit_total numeric := 0;
  ledger_reference text;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can run the sandbox loyalty conversion';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A cutover reference is required';
  end if;

  for wallet_row in
    select * from public.wallets
    where wallet_type = 'customer'
      and balance_ngn > 0
      and loyalty_credit_migrated_at is null
    for update
  loop
    source_amount := greatest(0, wallet_row.balance_ngn);
    credit_amount := round(source_amount / 10, 2);
    ledger_reference := next_reference || ':wallet:' || wallet_row.id;

    update public.wallets
    set balance_ngn = 0,
        balance = 0,
        loyalty_credit_ngn = credit_amount,
        loyalty_credit_initial_ngn = credit_amount,
        loyalty_credit_migrated_at = now(),
        loyalty_credit_exhausted_at = case when credit_amount = 0 then now() else null end,
        updated_at = now()
    where id = wallet_row.id;

    insert into public.wallet_loyalty_ledger(wallet_id, entry_type, amount_ngn, balance_after_ngn, reference, metadata)
    values (wallet_row.id, 'sandbox_conversion', credit_amount, credit_amount, ledger_reference,
      jsonb_build_object('source_balance_ngn', source_amount, 'conversion_rate', '10:1', 'cutover_reference', next_reference));

    converted_count := converted_count + 1;
    source_total := source_total + source_amount;
    credit_total := credit_total + credit_amount;
  end loop;

  return query select converted_count, source_total, credit_total;
end;
$$;

revoke all on function public.convert_sandbox_wallet_balances(text) from public, anon, authenticated;
grant execute on function public.convert_sandbox_wallet_balances(text) to service_role;

-- Close any still-pending Squad sandbox records before the LIVE key is used.
-- No pending wallet-funding row has credited a balance, so this does not alter
-- wallet totals. It does prevent a later reconciliation from querying Sandbox
-- references against the LIVE provider.
create or replace function public.revert_pending_sandbox_payments(next_reference text)
returns table(reverted_transactions integer, reverted_payment_intents integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_count integer := 0;
  withdrawal_count integer := 0;
  intent_count integer := 0;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can revert pending sandbox payments';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A cutover reference is required';
  end if;

  update public.transactions
  set status = 'reversed',
      metadata = metadata || jsonb_build_object('sandbox_cutover_reverted', true, 'cutover_reference', next_reference),
      description = coalesce(description, 'Pending sandbox payment reverted at LIVE cutover')
  where provider = 'squad'
    and status = 'pending';
  get diagnostics transaction_count = row_count;

  update public.payment_intents
  set status = 'failed',
      failure_code = 'SANDBOX_CUTOVER_REVERTED',
      failed_at = coalesce(failed_at, now()),
      updated_at = now()
  where status in ('initialized', 'pending');
  get diagnostics intent_count = row_count;

  -- Release test withdrawal holds as well, so no sandbox wallet is left
  -- mysteriously locked when the one-time credit is created.
  with pending_withdrawals as (
    select wallet_id, sum(abs(amount_ngn)) as amount_ngn
    from public.transactions
    where transaction_type = 'withdrawal' and status = 'pending'
    group by wallet_id
  )
  update public.wallets w
  set balance_ngn = w.balance_ngn + pending_withdrawals.amount_ngn,
      balance = greatest(0, coalesce(w.balance, 0) + pending_withdrawals.amount_ngn),
      locked_balance_ngn = greatest(0, w.locked_balance_ngn - pending_withdrawals.amount_ngn),
      updated_at = now()
  from pending_withdrawals
  where w.id = pending_withdrawals.wallet_id;

  update public.transactions
  set status = 'failed',
      metadata = metadata || jsonb_build_object('sandbox_cutover_reverted', true, 'cutover_reference', next_reference, 'reverted_withdrawal_hold', true)
  where transaction_type = 'withdrawal' and status = 'pending';
  get diagnostics withdrawal_count = row_count;
  transaction_count := transaction_count + withdrawal_count;

  return query select transaction_count, intent_count;
end;
$$;

revoke all on function public.revert_pending_sandbox_payments(text) from public, anon, authenticated;
grant execute on function public.revert_pending_sandbox_payments(text) to service_role;

-- Test deliveries are closed as cancelled, rather than falsely delivered. This
-- finishes the test queue without creating rider earnings, investor payouts,
-- delivery-completion notifications, or any LIVE-provider calls.
create or replace function public.close_test_deliveries_for_live_cutover(next_reference text)
returns table(closed_deliveries integer, closed_orders integer, closed_errands integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  delivery_count integer := 0;
  order_count integer := 0;
  errand_count integer := 0;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can close test deliveries';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A cutover reference is required';
  end if;

  with target as (
    select id, delivery_code from public.deliveries
    where status not in ('delivered', 'cancelled')
    for update
  ), changed as (
    update public.deliveries d
    set status = 'cancelled',
        metadata = d.metadata || jsonb_build_object('test_cleanup', true, 'test_cleanup_reference', next_reference, 'test_cleanup_at', now()),
        updated_at = now()
    from target
    where d.id = target.id
    returning d.id, d.delivery_code
  )
  insert into public.delivery_events(delivery_id, status, title, body)
  select id, 'cancelled', 'Test delivery closed for LIVE cutover', 'This sandbox test delivery was closed without settlement or customer notification.'
  from changed;
  get diagnostics delivery_count = row_count;

  update public.delivery_locations
  set status = 'cancelled', updated_at = now()
  where order_id in (
    select id from public.deliveries
    where metadata->>'test_cleanup_reference' = next_reference
  );

  update public.fleet_assets
  set status = 'available', current_delivery_id = null, updated_at = now()
  where current_delivery_id in (
    select id from public.deliveries
    where metadata->>'test_cleanup_reference' = next_reference
  );

  update public.orders
  set status = 'cancelled', updated_at = now()
  where delivery_id in (
    select id from public.deliveries
    where metadata->>'test_cleanup_reference' = next_reference
  ) and status not in ('delivered', 'cancelled');
  get diagnostics order_count = row_count;

  update public.fast_errand_orders
  set status = 'cancelled', updated_at = now()
  where delivery_id in (
    select id from public.deliveries
    where metadata->>'test_cleanup_reference' = next_reference
  ) and status not in ('delivered', 'cancelled');
  get diagnostics errand_count = row_count;

  return query select delivery_count, order_count, errand_count;
end;
$$;

revoke all on function public.close_test_deliveries_for_live_cutover(text) from public, anon, authenticated;
grant execute on function public.close_test_deliveries_for_live_cutover(text) to service_role;

-- This is the only mutating cutover entry point. PostgreSQL runs it as one
-- transaction, so a failure rolls back the full operation.
create or replace function public.run_sandbox_live_cutover(next_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  reverted record;
  closed record;
  converted record;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can run the LIVE cutover';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A cutover reference is required';
  end if;

  select * into reverted from public.revert_pending_sandbox_payments(next_reference);
  select * into closed from public.close_test_deliveries_for_live_cutover(next_reference);
  select * into converted from public.convert_sandbox_wallet_balances(next_reference);

  return jsonb_build_object(
    'reference', next_reference,
    'reverted_transactions', reverted.reverted_transactions,
    'reverted_payment_intents', reverted.reverted_payment_intents,
    'closed_deliveries', closed.closed_deliveries,
    'closed_orders', closed.closed_orders,
    'closed_errands', closed.closed_errands,
    'converted_wallets', converted.converted_wallets,
    'converted_source_ngn', converted.converted_source_ngn,
    'converted_credit_ngn', converted.converted_credit_ngn
  );
end;
$$;

revoke all on function public.run_sandbox_live_cutover(text) from public, anon, authenticated;
grant execute on function public.run_sandbox_live_cutover(text) to service_role;

-- Wallet checkout spends loyalty only against the platform-fee component. The
-- customer still needs enough cash for delivery/vendor/rider amounts.
create or replace function public.pay_delivery_from_wallet(
  target_delivery_id uuid,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_wallet public.wallets%rowtype;
  existing_transaction_id uuid;
  next_transaction_id uuid;
  platform_fee numeric;
  loyalty_used numeric := 0;
  cash_required numeric;
  next_loyalty numeric;
  payment_metadata jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_delivery from public.deliveries where id = target_delivery_id for update;
  if target_delivery.id is null then raise exception 'Delivery not found'; end if;
  if target_delivery.customer_id <> auth.uid() and public.current_user_role() <> 'admin' then raise exception 'Not allowed to pay for this delivery'; end if;
  if target_delivery.payment_method <> 'wallet' then raise exception 'This delivery is not set to wallet payment'; end if;

  select id into existing_transaction_id from public.transactions
  where delivery_id = target_delivery.id and transaction_type = 'delivery_payment' and status = 'successful' limit 1;
  if existing_transaction_id is not null then return existing_transaction_id; end if;

  select * into target_wallet from public.wallets
  where user_id = target_delivery.customer_id and wallet_type = 'customer' for update;
  if target_wallet.id is null then raise exception 'Customer wallet not found. Top up your wallet before checkout'; end if;

  platform_fee := greatest(0, coalesce(nullif(target_delivery.metadata->>'payable_platform_fee_ngn', '')::numeric, target_delivery.platform_fee_ngn, 0));
  loyalty_used := least(greatest(0, coalesce(target_wallet.loyalty_credit_ngn, 0)), platform_fee);
  cash_required := greatest(0, target_delivery.price_ngn - loyalty_used);
  if coalesce(target_wallet.balance_ngn, 0) < cash_required then raise exception 'Insufficient wallet balance for this checkout payment'; end if;
  next_loyalty := greatest(0, coalesce(target_wallet.loyalty_credit_ngn, 0) - loyalty_used);
  payment_metadata := coalesce(next_metadata, '{}'::jsonb) || jsonb_build_object('loyalty_credit_used_ngn', loyalty_used, 'cash_paid_ngn', cash_required);

  update public.wallets
  set balance_ngn = balance_ngn - cash_required,
      balance = greatest(0, coalesce(balance, 0) - cash_required),
      loyalty_credit_ngn = next_loyalty,
      loyalty_credit_exhausted_at = case when next_loyalty = 0 and loyalty_used > 0 then coalesce(loyalty_credit_exhausted_at, now()) else loyalty_credit_exhausted_at end,
      updated_at = now()
  where id = target_wallet.id;

  insert into public.transactions(wallet_id, delivery_id, transaction_type, amount_ngn, status, provider, provider_reference, metadata)
  values (target_wallet.id, target_delivery.id, 'delivery_payment', target_delivery.price_ngn * -1, 'successful', 'fastfleet_wallet', target_delivery.delivery_code || '-wallet-checkout', payment_metadata)
  returning id into next_transaction_id;

  if loyalty_used > 0 then
    insert into public.wallet_loyalty_ledger(wallet_id, entry_type, amount_ngn, balance_after_ngn, reference, metadata)
    values (target_wallet.id, 'platform_fee_spend', loyalty_used, next_loyalty, target_delivery.delivery_code || '-loyalty-spend', jsonb_build_object('delivery_id', target_delivery.id, 'platform_fee_ngn', platform_fee));
    if next_loyalty = 0 then
      insert into public.wallet_loyalty_ledger(wallet_id, entry_type, amount_ngn, balance_after_ngn, reference, metadata)
      values (target_wallet.id, 'exhausted', 0, 0, target_delivery.delivery_code || '-loyalty-exhausted', jsonb_build_object('delivery_id', target_delivery.id));
    end if;
  end if;

  update public.deliveries
  set status = 'searching', metadata = metadata || jsonb_build_object('wallet_paid_at', now()) || payment_metadata, updated_at = now()
  where id = target_delivery.id;
  return next_transaction_id;
end;
$$;

commit;
