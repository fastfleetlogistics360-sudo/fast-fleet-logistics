-- Rider-first checkout settlement integration. This migration is forward-only
-- and leaves historical paid deliveries and payment-first checkout untouched.
begin;

-- The accepted rider is promoted only inside the payment settlement
-- transaction. If expiry won the race, retain the verified payment and route
-- the delivery to operational review rather than silently dispatching it.
create or replace function public.sync_rider_payment_reservation_on_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.delivery_payment_reservations%rowtype;
  delivery public.deliveries%rowtype;
begin
  if new.status <> 'settled' or old.status = 'settled' or new.delivery_id is null
    or new.purpose not in ('delivery_payment', 'marketplace_delivery_payment') then
    return new;
  end if;

  select * into delivery from public.deliveries where id = new.delivery_id for update;
  if delivery.id is null or coalesce((delivery.metadata->>'rider_payment_reservation'), 'false') <> 'true' then
    return new;
  end if;
  select * into reservation from public.delivery_payment_reservations where delivery_id = delivery.id for update;
  if reservation.delivery_id is null then
    return new;
  end if;

  if reservation.status = 'reserved' and reservation.expires_at > now()
    and delivery.rider_id = reservation.rider_profile_id then
    update public.delivery_payment_reservations set status = 'paid', updated_at = now() where delivery_id = delivery.id;
    update public.deliveries set status = 'accepted',
      metadata = metadata || jsonb_build_object('rider_payment_confirmed_at', now()), updated_at = now()
    where id = delivery.id;
    insert into public.delivery_events(delivery_id, actor_id, status, title, body)
    values (delivery.id, new.owner_user_id, 'accepted', 'Payment confirmed', 'Payment successful. Your rider is ready to proceed.');
  else
    update public.delivery_payment_reservations set status = 'late_payment_review', updated_at = now()
    where delivery_id = delivery.id and status <> 'paid';
    update public.deliveries set rider_id = null, accepted_at = null, status = 'searching',
      metadata = metadata || jsonb_build_object('late_payment_review', true, 'late_payment_received_at', now()), updated_at = now()
    where id = delivery.id;
    insert into public.delivery_events(delivery_id, actor_id, status, title, body)
    values (delivery.id, new.owner_user_id, 'searching', 'Payment requires dispatch review', 'Payment was received after the rider reservation changed. Dispatch will safely reassign this delivery.');
  end if;
  return new;
end;
$$;

drop trigger if exists sync_rider_payment_reservation_on_settlement on public.payment_intents;
create trigger sync_rider_payment_reservation_on_settlement
after update of status on public.payment_intents
for each row execute function public.sync_rider_payment_reservation_on_settlement();

-- A provider can report success after the checkout request itself timed out.
-- Settlement intentionally refuses to post an automatic ledger entry in that
-- case, but this RPC records an explicit operational-review state so the
-- customer payment is never mistaken for an abandoned reservation.
create or replace function public.mark_late_rider_payment_for_review(target_payment_intent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare target_intent public.payment_intents%rowtype; delivery public.deliveries%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select * into target_intent from public.payment_intents where id = target_payment_intent_id for update;
  if target_intent.id is null or target_intent.delivery_id is null then return; end if;
  select * into delivery from public.deliveries where id = target_intent.delivery_id for update;
  if delivery.id is null or coalesce((delivery.metadata->>'rider_payment_reservation'), 'false') <> 'true' then return; end if;
  update public.payment_intents set status='requires_review', failure_code='PAYMENT_AFTER_RESERVATION_CHANGE', updated_at=now()
    where id=target_intent.id and status <> 'settled';
  update public.delivery_payment_reservations set status='late_payment_review', updated_at=now()
    where delivery_id=delivery.id and status <> 'paid';
  update public.deliveries set rider_id=null, accepted_at=null, status='searching',
    metadata=metadata || jsonb_build_object('late_payment_review',true,'late_payment_received_at',now()), updated_at=now()
    where id=delivery.id;
  insert into public.delivery_events(delivery_id,actor_id,status,title,body)
  values(delivery.id,target_intent.owner_user_id,'searching','Payment requires dispatch review','Payment was confirmed after the rider reservation changed. Dispatch will review it before assigning a rider.');
end;
$$;
revoke all on function public.mark_late_rider_payment_for_review(uuid) from public, anon, authenticated;
grant execute on function public.mark_late_rider_payment_for_review(uuid) to service_role;

-- A started checkout is still an unpaid reservation. Include it in expiry,
-- and release a fleet bicycle allocation at the same time when applicable.
create or replace function public.expire_delivery_payment_reservations()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  with expired as (
    update public.delivery_payment_reservations r set status='expired', updated_at=now()
    from public.deliveries d where d.id=r.delivery_id and r.status='reserved' and r.expires_at <= now()
      and d.status in ('awaiting_customer_payment', 'searching')
      and coalesce((d.metadata->>'rider_payment_reservation'), 'false') = 'true'
      and not exists (select 1 from public.payment_intents pi where pi.delivery_id=d.id and pi.status='settled')
    returning d.id
  ), released_assets as (
    update public.fleet_assets fa set status='available', current_delivery_id=null, updated_at=now()
    where fa.current_delivery_id in (select id from expired) returning fa.current_delivery_id
  ), released as (
    update public.deliveries d set rider_id=null, accepted_at=null, status='searching',
      metadata=d.metadata || jsonb_build_object('payment_reservation_expired_at',now()), updated_at=now()
    where d.id in (select id from expired) returning d.id
  ) select count(*) into changed from released;
  return changed;
end $$;
revoke all on function public.expire_delivery_payment_reservations() from public, anon, authenticated;
grant execute on function public.expire_delivery_payment_reservations() to service_role;

commit;
