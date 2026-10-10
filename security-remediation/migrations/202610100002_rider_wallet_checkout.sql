-- Let a rider pay for their own delivery checkout from their rider wallet.
-- Loyalty is still limited to the platform-fee component; any remaining cost
-- is charged to the rider's withdrawable wallet balance.

begin;

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
  target_wallet_type text;
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

  target_wallet_type := case when public.current_user_role() = 'rider' then 'rider' else 'customer' end;
  select * into target_wallet from public.wallets
  where user_id = target_delivery.customer_id and wallet_type = target_wallet_type for update;
  if target_wallet.id is null then
    raise exception '% wallet not found. Add funds before checkout', initcap(target_wallet_type);
  end if;

  platform_fee := greatest(0, coalesce(nullif(target_delivery.metadata->>'payable_platform_fee_ngn', '')::numeric, target_delivery.platform_fee_ngn, 0));
  loyalty_used := least(greatest(0, coalesce(target_wallet.loyalty_credit_ngn, 0)), platform_fee);
  cash_required := greatest(0, target_delivery.price_ngn - loyalty_used);
  if coalesce(target_wallet.balance_ngn, 0) < cash_required then raise exception 'Insufficient wallet balance for this checkout payment'; end if;
  next_loyalty := greatest(0, coalesce(target_wallet.loyalty_credit_ngn, 0) - loyalty_used);
  payment_metadata := coalesce(next_metadata, '{}'::jsonb) || jsonb_build_object(
    'wallet_type', target_wallet_type,
    'loyalty_credit_used_ngn', loyalty_used,
    'cash_paid_ngn', cash_required
  );

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
    values (target_wallet.id, 'platform_fee_spend', loyalty_used, next_loyalty, target_delivery.delivery_code || '-loyalty-spend', jsonb_build_object('delivery_id', target_delivery.id, 'platform_fee_ngn', platform_fee, 'wallet_type', target_wallet_type));
    if next_loyalty = 0 then
      insert into public.wallet_loyalty_ledger(wallet_id, entry_type, amount_ngn, balance_after_ngn, reference, metadata)
      values (target_wallet.id, 'exhausted', 0, 0, target_delivery.delivery_code || '-loyalty-exhausted', jsonb_build_object('delivery_id', target_delivery.id, 'wallet_type', target_wallet_type));
    end if;
  end if;

  update public.deliveries
  set status = 'searching', metadata = metadata || jsonb_build_object('wallet_paid_at', now()) || payment_metadata, updated_at = now()
  where id = target_delivery.id;
  return next_transaction_id;
end;
$$;

revoke all on function public.pay_delivery_from_wallet(uuid, jsonb) from public, anon;
grant execute on function public.pay_delivery_from_wallet(uuid, jsonb) to authenticated, service_role;

commit;
