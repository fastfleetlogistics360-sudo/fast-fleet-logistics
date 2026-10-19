-- A Marketplace business order is settled before its vendor creates the
-- linked rider delivery.  The settled payment is attached to orders.id, so
-- that authoritative linkage must unlock the delivery just as a settled
-- delivery-specific payment does.  Rider-first reservations remain opt-in
-- and unchanged.
begin;

create or replace function public.delivery_payment_is_verified(target_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.deliveries d
    where d.id = target_delivery_id
      and (
        coalesce(d.price_ngn, 0) = 0
        or exists (
          select 1 from public.payment_intents pi
          where pi.delivery_id = d.id and pi.status = 'settled'
        )
        or exists (
          select 1 from public.transactions t
          where t.delivery_id = d.id
            and t.transaction_type = 'delivery_payment'
            and t.status = 'successful'
        )
        or exists (
          select 1 from public.payment_intents pi
          where pi.order_id = d.marketplace_order_id
            and pi.purpose = 'marketplace_business_order'
            and pi.status = 'settled'
        )
      )
  );
$$;

revoke all on function public.delivery_payment_is_verified(uuid) from public, anon, authenticated;

commit;
