-- Forward-only checkout upgrade foundation. Apply after payment-intent and
-- rider-contact privacy migrations; no historical order is rewritten.
--
-- `awaiting_customer_payment` is added and committed by 140001. Keeping it
-- in the prior migration makes this file safe under migration runners that
-- wrap each file in a transaction.
begin;
alter table public.orders add column if not exists fulfilment_method text not null default 'DELIVERY'
  check (fulfilment_method in ('DELIVERY', 'PICKUP'));
alter table public.orders add column if not exists pickup_ready_at timestamptz;

create table if not exists public.delivery_payment_reservations (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  rider_profile_id uuid not null references public.rider_profiles(id),
  expires_at timestamptz not null,
  status text not null default 'reserved' check (status in ('reserved','paid','expired','released','late_payment_review')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists delivery_payment_reservations_expiry_idx on public.delivery_payment_reservations(status, expires_at);
alter table public.delivery_payment_reservations enable row level security;
revoke all on public.delivery_payment_reservations from anon, authenticated;

-- Preserve the established, thoroughly validated acceptance function for paid
-- work. The wrapper adds only the opt-in unpaid-reservation branch. Checkout
-- does not set this metadata until Stage 2, so existing payment-first jobs
-- continue to execute the original function unchanged.
-- `ALTER FUNCTION ... IF EXISTS` is not accepted by every Supabase SQL
-- runner. The catalog guard also keeps a retried local migration idempotent.
do $$
begin
  if to_regprocedure('public.accept_or_queue_delivery_offer(uuid)') is not null
    and to_regprocedure('public.accept_or_queue_paid_delivery_offer(uuid)') is null then
    execute 'alter function public.accept_or_queue_delivery_offer(uuid) rename to accept_or_queue_paid_delivery_offer';
  end if;
  if to_regprocedure('public.accept_or_queue_paid_delivery_offer(uuid)') is not null then
    execute 'revoke all on function public.accept_or_queue_paid_delivery_offer(uuid) from public, anon, authenticated';
  end if;
end;
$$;

create or replace function public.accept_or_queue_delivery_offer(target_delivery_id uuid)
returns table(delivery_id uuid, assignment_status public.delivery_status)
language plpgsql security definer set search_path=public as $$
declare accepted record; d public.deliveries%rowtype; rider public.rider_profiles%rowtype;
  reservation_minutes integer := 5; controls jsonb := '{}'::jsonb; expires timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into d from public.deliveries where id=target_delivery_id for update;
  if d.id is null then raise exception 'Delivery not found'; end if;
  if coalesce((d.metadata->>'rider_payment_reservation'), 'false') <> 'true' then
    return query select * from public.accept_or_queue_paid_delivery_offer(target_delivery_id);
    return;
  end if;
  select * into rider from public.rider_profiles where user_id=auth.uid() for update;
  if rider.id is null then raise exception 'Rider profile not found'; end if;
  if exists (select 1 from public.delivery_payment_reservations r where r.rider_profile_id=rider.id and r.status='reserved' and r.expires_at>now()) then
    raise exception 'Complete or wait for your pending customer payment reservation before accepting another delivery';
  end if;
  select value into controls from public.platform_settings where key='admin_site_controls';
  reservation_minutes := least(15, greatest(1, coalesce(nullif(controls #>> '{delivery_policy,payment_reservation_minutes}','')::integer,5)));
  select * into accepted from public.accept_or_queue_paid_delivery_offer(target_delivery_id);
  if accepted.assignment_status <> 'accepted'::public.delivery_status then
    -- The legacy function may queue a paid order after an active trip. A
    -- payment reservation must instead be immediately actionable after
    -- settlement, so roll back that provisional queue assignment.
    raise exception 'Complete your active delivery before reserving an unpaid customer-payment delivery';
  end if;
  expires := now() + make_interval(mins=>reservation_minutes);
  update public.deliveries set status='awaiting_customer_payment', metadata=metadata || jsonb_build_object('payment_reservation_expires_at',expires), updated_at=now() where id=target_delivery_id;
  insert into public.delivery_payment_reservations(delivery_id,rider_profile_id,expires_at)
  values(target_delivery_id,rider.id,expires)
  on conflict (delivery_id) do update set rider_profile_id=excluded.rider_profile_id,expires_at=excluded.expires_at,status='reserved',updated_at=now()
  where public.delivery_payment_reservations.status in ('expired','released');
  insert into public.delivery_events(delivery_id,actor_id,status,title,body)
  values(target_delivery_id,auth.uid(),'awaiting_customer_payment','Awaiting customer payment','Rider reserved while the customer completes payment.');
  return query select target_delivery_id,'awaiting_customer_payment'::public.delivery_status;
end $$;
grant execute on function public.accept_or_queue_delivery_offer(uuid) to authenticated;

create table if not exists public.marketplace_pickup_confirmations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  code_digest text not null, code_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending','verified','expired','locked','replaced')),
  attempts integer not null default 0, max_attempts integer not null default 5,
  expires_at timestamptz not null, verified_at timestamptz, verified_by uuid references public.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.marketplace_pickup_confirmations enable row level security;
revoke all on public.marketplace_pickup_confirmations from anon, authenticated;

-- Configuration stays server-controlled. A missing value uses five minutes.
create or replace function public.expire_delivery_payment_reservations()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  with expired as (
    update public.delivery_payment_reservations r set status='expired', updated_at=now()
    from public.deliveries d where d.id=r.delivery_id and r.status='reserved' and r.expires_at <= now()
      and d.status='awaiting_customer_payment'
      and not exists (select 1 from public.payment_intents pi where pi.delivery_id=d.id and pi.status='settled')
    returning d.id
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
