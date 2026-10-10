-- Rider sandbox-to-loyalty cutover.
--
-- Safety rule: no rider cash is inferred from a wallet's aggregate balance.
-- A successful positive rider ledger entry is sandbox value when it was
-- created before the LIVE-payment cutover (2026-09-07 00:37:35 WAT), or when
-- it is explicitly marked sandbox. Later credits remain rider cash.

begin;

alter table public.wallets
  add column if not exists loyalty_credit_ngn numeric not null default 0 check (loyalty_credit_ngn >= 0),
  add column if not exists loyalty_credit_initial_ngn numeric not null default 0 check (loyalty_credit_initial_ngn >= 0),
  add column if not exists loyalty_credit_exhausted_at timestamptz,
  add column if not exists loyalty_credit_migrated_at timestamptz;

create table if not exists public.wallet_loyalty_ledger (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallets(id) on delete restrict,
  entry_type text not null check (entry_type in ('sandbox_conversion', 'rider_sandbox_conversion', 'platform_fee_spend', 'exhausted')),
  amount_ngn numeric not null check (amount_ngn >= 0),
  balance_after_ngn numeric not null check (balance_after_ngn >= 0),
  reference text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.wallet_loyalty_ledger
  drop constraint if exists wallet_loyalty_ledger_entry_type_check;

alter table public.wallet_loyalty_ledger
  add constraint wallet_loyalty_ledger_entry_type_check
  check (entry_type in ('sandbox_conversion', 'rider_sandbox_conversion', 'platform_fee_spend', 'exhausted'));

-- This preview is also the source of truth for the mutating function below.
-- The LIVE key replaced the sandbox key at 2026-09-06 23:37:35.374207+00
-- (00:37:35 WAT on 7 September).
create or replace function public.preview_rider_sandbox_loyalty_cutover()
returns table(
  wallet_id uuid,
  user_id uuid,
  current_balance_ngn numeric,
  protected_cash_ngn numeric,
  identified_sandbox_source_ngn numeric,
  convertible_sandbox_ngn numeric,
  projected_loyalty_credit_ngn numeric,
  pre_live_sandbox_source_ngn numeric
)
language sql
security definer
set search_path = public
as $$
  with rider_wallets as (
    select id, user_id, greatest(0, balance_ngn) as balance_ngn
    from public.wallets
    where wallet_type = 'rider'
      and loyalty_credit_migrated_at is null
  ), source_credits as (
    select
      w.id as wallet_id,
      w.user_id,
      w.balance_ngn,
      coalesce(sum(case
        when t.status = 'successful'
          and t.amount_ngn > 0
          and (
            t.created_at < timestamptz '2026-09-06 23:37:35.374207+00'
            or lower(coalesce(t.metadata ->> 'payment_environment', t.metadata ->> 'squad_environment', '')) = 'sandbox'
          )
        then t.amount_ngn else 0 end), 0) as sandbox_source_ngn,
      coalesce(sum(case
        when t.status = 'successful'
          and t.amount_ngn > 0
          and t.created_at >= timestamptz '2026-09-06 23:37:35.374207+00'
          and lower(coalesce(t.metadata ->> 'payment_environment', t.metadata ->> 'squad_environment', '')) <> 'sandbox'
        then t.amount_ngn else 0 end), 0) as protected_source_ngn,
      coalesce(sum(case
        when t.status = 'successful'
          and t.amount_ngn > 0
          and t.created_at < timestamptz '2026-09-06 23:37:35.374207+00'
        then t.amount_ngn else 0 end), 0) as pre_live_sandbox_source_ngn
    from rider_wallets w
    left join public.transactions t on t.wallet_id = w.id
    group by w.id, w.user_id, w.balance_ngn
  ), allocated as (
    select
      wallet_id,
      user_id,
      balance_ngn,
      least(balance_ngn, protected_source_ngn) as protected_cash_ngn,
      sandbox_source_ngn,
      least(sandbox_source_ngn, greatest(0, balance_ngn - least(balance_ngn, protected_source_ngn))) as convertible_sandbox_ngn,
      pre_live_sandbox_source_ngn
    from source_credits
  )
  select
    wallet_id,
    user_id,
    balance_ngn,
    protected_cash_ngn,
    sandbox_source_ngn,
    convertible_sandbox_ngn,
    round(convertible_sandbox_ngn / 10, 2),
    pre_live_sandbox_source_ngn
  from allocated;
$$;

revoke all on function public.preview_rider_sandbox_loyalty_cutover() from public, anon, authenticated;
grant execute on function public.preview_rider_sandbox_loyalty_cutover() to service_role;

create or replace function public.convert_rider_sandbox_wallet_balances(next_reference text)
returns table(converted_wallets integer, converted_source_ngn numeric, converted_credit_ngn numeric, protected_cash_ngn numeric, pre_live_sandbox_source_ngn numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate record;
  wallet_row record;
  converted_count integer := 0;
  source_total numeric := 0;
  credit_total numeric := 0;
  protected_total numeric := 0;
  pre_live_sandbox_total numeric := 0;
  credit_amount numeric;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can run the rider sandbox loyalty conversion';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A cutover reference is required';
  end if;

  for candidate in
    select wallet_id from public.preview_rider_sandbox_loyalty_cutover()
  loop
    -- Lock before taking the per-wallet snapshot so an approved withdrawal or
    -- settlement cannot race this one-time movement.
    perform 1
    from public.wallets
    where id = candidate.wallet_id
      and wallet_type = 'rider'
      and loyalty_credit_migrated_at is null
    for update;
    if not found then
      continue;
    end if;

    select * into wallet_row
    from public.preview_rider_sandbox_loyalty_cutover()
    where wallet_id = candidate.wallet_id;
    if not found then
      continue;
    end if;

    protected_total := protected_total + wallet_row.protected_cash_ngn;
    pre_live_sandbox_total := pre_live_sandbox_total + wallet_row.pre_live_sandbox_source_ngn;
    if wallet_row.convertible_sandbox_ngn <= 0 then
      continue;
    end if;

    credit_amount := round(wallet_row.convertible_sandbox_ngn / 10, 2);
    update public.wallets
    set balance_ngn = greatest(0, balance_ngn - wallet_row.convertible_sandbox_ngn),
        balance = greatest(0, coalesce(balance, 0) - wallet_row.convertible_sandbox_ngn),
        loyalty_credit_ngn = coalesce(loyalty_credit_ngn, 0) + credit_amount,
        loyalty_credit_initial_ngn = coalesce(loyalty_credit_initial_ngn, 0) + credit_amount,
        loyalty_credit_migrated_at = now(),
        loyalty_credit_exhausted_at = case when coalesce(loyalty_credit_ngn, 0) + credit_amount = 0 then now() else null end,
        updated_at = now()
    where id = wallet_row.wallet_id
      and wallet_type = 'rider'
      and loyalty_credit_migrated_at is null;

    if not found then
      continue;
    end if;

    insert into public.wallet_loyalty_ledger(wallet_id, entry_type, amount_ngn, balance_after_ngn, reference, metadata)
    values (
      wallet_row.wallet_id,
      'rider_sandbox_conversion',
      credit_amount,
      credit_amount,
      next_reference || ':rider-wallet:' || wallet_row.wallet_id,
      jsonb_build_object(
        'source_balance_ngn', wallet_row.convertible_sandbox_ngn,
        'conversion_rate', '10:1',
        'cutover_reference', next_reference,
        'protected_cash_ngn', wallet_row.protected_cash_ngn,
        'pre_live_sandbox_source_ngn', wallet_row.pre_live_sandbox_source_ngn,
        'live_key_cutover_at', '2026-09-06T23:37:35.374207Z'
      )
    );

    converted_count := converted_count + 1;
    source_total := source_total + wallet_row.convertible_sandbox_ngn;
    credit_total := credit_total + credit_amount;
  end loop;

  return query select converted_count, source_total, credit_total, protected_total, pre_live_sandbox_total;
end;
$$;

revoke all on function public.convert_rider_sandbox_wallet_balances(text) from public, anon, authenticated;
grant execute on function public.convert_rider_sandbox_wallet_balances(text) to service_role;

-- This is intentionally separate from the existing customer/business LIVE
-- cutover. Running it cannot close deliveries or alter any non-rider wallet.
create or replace function public.run_rider_sandbox_loyalty_cutover(next_reference text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rider_converted record;
begin
  if public.current_user_role() <> 'admin' and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only admins can run the rider sandbox loyalty cutover';
  end if;
  if nullif(trim(next_reference), '') is null then
    raise exception 'A rider cutover reference is required';
  end if;

  select * into rider_converted from public.convert_rider_sandbox_wallet_balances(next_reference);

  return jsonb_build_object(
    'reference', next_reference,
    'rider_converted_wallets', rider_converted.converted_wallets,
    'rider_converted_source_ngn', rider_converted.converted_source_ngn,
    'rider_converted_credit_ngn', rider_converted.converted_credit_ngn,
    'rider_protected_cash_ngn', rider_converted.protected_cash_ngn,
    'rider_pre_live_sandbox_source_ngn', rider_converted.pre_live_sandbox_source_ngn
  );
end;
$$;

revoke all on function public.run_rider_sandbox_loyalty_cutover(text) from public, anon, authenticated;
grant execute on function public.run_rider_sandbox_loyalty_cutover(text) to service_role;

commit;
