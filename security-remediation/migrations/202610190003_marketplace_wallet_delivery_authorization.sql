-- A paid Wallet Marketplace order may create its delivery only after vendor
-- preparation. Its successful wallet ledger entry must therefore authorize
-- that linked delivery without ever enabling rider-first reservations.
begin;

create or replace function public.delivery_payment_is_verified(target_delivery_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (
    select 1 from public.deliveries d where d.id=target_delivery_id and (
      coalesce(d.price_ngn,0)=0
      or exists (select 1 from public.payment_intents pi where pi.delivery_id=d.id and pi.status='settled')
      or exists (select 1 from public.transactions t where t.delivery_id=d.id and t.transaction_type='delivery_payment' and t.status='successful')
      or exists (select 1 from public.payment_intents pi where pi.order_id=d.marketplace_order_id and pi.purpose='marketplace_business_order' and pi.status='settled')
      or exists (
        select 1 from public.orders o join public.transactions t on t.provider_reference=o.order_code || '-wallet-checkout'
        where o.id=d.marketplace_order_id and o.marketplace_kind in ('restaurant','shopping')
          and o.payment_method='wallet' and o.payment_status='paid'
          and t.transaction_type='delivery_payment' and t.status='successful' and t.provider='fastfleet_wallet'
          and t.metadata @> jsonb_build_object('marketplace_order_id',o.id)
      )
    )
  );
$$;
revoke all on function public.delivery_payment_is_verified(uuid) from public, anon, authenticated;
commit;
