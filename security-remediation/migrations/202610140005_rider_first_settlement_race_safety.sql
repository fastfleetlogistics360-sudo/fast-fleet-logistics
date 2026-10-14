-- Follow-up compatibility for the rider-first checkout path. This migration
-- is additive: the proven Squad settlement body stays intact and is invoked
-- through a small, locked compatibility wrapper.
begin;

alter function public.settle_squad_payment_intent(uuid, text, bigint, text, text, text, timestamptz)
  rename to settle_squad_payment_intent_base;

create or replace function public.settle_squad_payment_intent(
  target_payment_intent_id uuid,
  next_provider_reference text,
  next_amount_minor bigint,
  next_currency text,
  next_provider_status text,
  next_gateway_reference text default null,
  next_paid_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_intent public.payment_intents%rowtype;
  target_delivery public.deliveries%rowtype;
  target_reservation public.delivery_payment_reservations%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  -- Take the same payment-intent and delivery locks as the legacy settlement
  -- function before admitting the short pre-activation window. A payment that
  -- wins this race is safely settled; an expired reservation remains subject
  -- to the existing review path rather than being silently dispatched.
  select * into target_intent from public.payment_intents
    where id = target_payment_intent_id and provider = 'squad'
    for update;
  if target_intent.id is null then
    raise exception 'Payment intent not found' using errcode = 'P0002';
  end if;
  if target_intent.delivery_id is not null
    and target_intent.purpose in ('delivery_payment', 'marketplace_delivery_payment') then
    select * into target_delivery from public.deliveries
      where id = target_intent.delivery_id for update;
    if target_delivery.id is not null
      and target_delivery.status = 'awaiting_customer_payment'
      and coalesce((target_delivery.metadata->>'rider_payment_reservation'), 'false') = 'true' then
      select * into target_reservation from public.delivery_payment_reservations
        where delivery_id = target_delivery.id for update;
      if target_reservation.status = 'reserved'
        and target_reservation.expires_at > now()
        and target_reservation.rider_profile_id = target_delivery.rider_id then
        update public.deliveries
          set status = 'searching', updated_at = now()
          where id = target_delivery.id and status = 'awaiting_customer_payment';
      end if;
    end if;
  end if;

  return public.settle_squad_payment_intent_base(
    target_payment_intent_id,
    next_provider_reference,
    next_amount_minor,
    next_currency,
    next_provider_status,
    next_gateway_reference,
    next_paid_at
  );
end;
$$;

revoke all on function public.settle_squad_payment_intent_base(uuid, text, bigint, text, text, text, timestamptz)
  from public, anon, authenticated;
revoke all on function public.settle_squad_payment_intent(uuid, text, bigint, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.settle_squad_payment_intent(uuid, text, bigint, text, text, text, timestamptz)
  to service_role;

-- Acquire delivery then reservation locks, matching settlement-trigger lock
-- order. SKIP LOCKED makes concurrent cron invocations idempotent and leaves
-- an in-flight settlement to finish before any later expiry pass evaluates it.
create or replace function public.expire_delivery_payment_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_delivery public.deliveries%rowtype;
  target_reservation public.delivery_payment_reservations%rowtype;
  changed integer := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  for target_delivery in
    select d.*
    from public.deliveries d
    join public.delivery_payment_reservations r on r.delivery_id = d.id
    where r.status = 'reserved'
      and r.expires_at <= now()
      and d.status in ('awaiting_customer_payment', 'searching')
      and coalesce((d.metadata->>'rider_payment_reservation'), 'false') = 'true'
    order by d.id
    for update of d skip locked
  loop
    select * into target_reservation from public.delivery_payment_reservations
      where delivery_id = target_delivery.id for update;
    if target_reservation.status <> 'reserved' or target_reservation.expires_at > now()
      or exists (select 1 from public.payment_intents pi where pi.delivery_id = target_delivery.id and pi.status = 'settled') then
      continue;
    end if;
    update public.delivery_payment_reservations
      set status = 'expired', updated_at = now()
      where delivery_id = target_delivery.id and status = 'reserved';
    if not found then continue; end if;
    update public.fleet_assets
      set status = 'available', current_delivery_id = null, updated_at = now()
      where current_delivery_id = target_delivery.id;
    update public.deliveries
      set rider_id = null, accepted_at = null, status = 'searching',
          metadata = metadata || jsonb_build_object('payment_reservation_expired_at', now()),
          updated_at = now()
      where id = target_delivery.id;
    changed := changed + 1;
  end loop;
  return changed;
end;
$$;

revoke all on function public.expire_delivery_payment_reservations() from public, anon, authenticated;
grant execute on function public.expire_delivery_payment_reservations() to service_role;

commit;
