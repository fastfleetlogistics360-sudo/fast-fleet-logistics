-- Atomic customer-wallet payment for paid Restaurant and Shopping Marketplace
-- orders. This deliberately excludes direct dispatch and every other service.
begin;

create or replace function public.pay_marketplace_order_from_wallet(target_order_id uuid, next_metadata jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path=public as $$
declare target_order public.orders%rowtype; target_wallet public.wallets%rowtype; existing_transaction_id uuid; next_transaction_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into target_order from public.orders where id=target_order_id for update;
  if target_order.id is null then raise exception 'Marketplace order not found'; end if;
  if target_order.customer_id <> auth.uid() then raise exception 'Not allowed to pay for this Marketplace order'; end if;
  if target_order.marketplace_kind not in ('restaurant','shopping') then raise exception 'Wallet Marketplace checkout is available only for Restaurant and Shopping orders'; end if;
  if target_order.payment_method <> 'wallet' then raise exception 'This Marketplace order is not set to wallet payment'; end if;
  select id into existing_transaction_id from public.transactions where provider_reference=target_order.order_code || '-wallet-checkout' and status='successful' limit 1;
  if existing_transaction_id is not null then return existing_transaction_id; end if;
  select * into target_wallet from public.wallets where user_id=target_order.customer_id and wallet_type='customer' for update;
  if target_wallet.id is null then raise exception 'Customer wallet not found. Top up your wallet before checkout'; end if;
  if coalesce(target_wallet.balance_ngn,0) < target_order.amount then raise exception 'Insufficient wallet balance for this checkout payment'; end if;
  update public.wallets set balance_ngn=balance_ngn-target_order.amount, updated_at=now() where id=target_wallet.id;
  insert into public.transactions(wallet_id,delivery_id,transaction_type,amount_ngn,status,provider,provider_reference,metadata)
  values(target_wallet.id,target_order.delivery_id,'delivery_payment',target_order.amount * -1,'successful','fastfleet_wallet',target_order.order_code || '-wallet-checkout',coalesce(next_metadata,'{}'::jsonb) || jsonb_build_object('marketplace_order_id',target_order.id)) returning id into next_transaction_id;
  update public.orders set payment_status='paid',status='received',updated_at=now() where id=target_order.id and payment_status='pending';
  update public.deliveries set status='searching',metadata=metadata || jsonb_build_object('wallet_paid_at',now()),updated_at=now() where id=target_order.delivery_id and status='pending_payment';
  return next_transaction_id;
end $$;
revoke all on function public.pay_marketplace_order_from_wallet(uuid,jsonb) from public, anon;
grant execute on function public.pay_marketplace_order_from_wallet(uuid,jsonb) to authenticated;
commit;
