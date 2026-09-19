-- Apply this once to the existing Supabase project after deploying the app.
-- It makes the database RPC enforce the same wallet top-up range as the app.

create or replace function public.create_wallet_funding(
  next_user_id uuid,
  next_wallet_type text,
  next_amount_ngn numeric,
  next_provider text,
  next_provider_reference text,
  next_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  next_wallet_id uuid;
  next_transaction_id uuid;
  site_controls jsonb := '{}'::jsonb;
  min_topup_ngn numeric;
  max_topup_ngn numeric;
begin
  execute 'select value from public.platform_settings where key = ''admin_site_controls''' into site_controls;
  site_controls := coalesce(site_controls, '{}'::jsonb);
  min_topup_ngn := least(1000000, greatest(1000, coalesce(nullif(site_controls #>> '{wallet_policy,min_topup_ngn}', '')::numeric, 1000)));
  max_topup_ngn := least(1000000, greatest(min_topup_ngn, coalesce(nullif(site_controls #>> '{wallet_policy,max_topup_ngn}', '')::numeric, 50000)));

  if next_amount_ngn < min_topup_ngn or next_amount_ngn > max_topup_ngn or next_amount_ngn <> trunc(next_amount_ngn) then
    raise exception 'Wallet funding amount must be a whole number within the configured top-up range';
  end if;

  next_wallet_id := public.ensure_wallet(next_user_id, next_wallet_type);

  insert into public.transactions (
    wallet_id,
    transaction_type,
    amount_ngn,
    status,
    provider,
    provider_reference,
    metadata
  )
  values (
    next_wallet_id,
    'wallet_funding',
    next_amount_ngn,
    'pending',
    next_provider,
    next_provider_reference,
    coalesce(next_metadata, '{}'::jsonb)
  )
  on conflict (provider_reference) do update set
    status = case when public.transactions.status = 'successful' then 'successful' else 'pending' end,
    metadata = public.transactions.metadata || excluded.metadata
  returning id into next_transaction_id;

  return next_transaction_id;
end;
$$;

update public.platform_settings
set value = jsonb_set(
  jsonb_set(value, '{wallet_policy,min_topup_ngn}', '1000'::jsonb, true),
  '{wallet_policy,max_topup_ngn}', '50000'::jsonb,
  true
)
where key = 'admin_site_controls';
