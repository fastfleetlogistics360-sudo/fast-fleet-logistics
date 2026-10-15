-- Forward-only repair for a database where 202610140002 was rolled back
-- before it could replace the rider-acceptance RPC. Apply only after the
-- read-only checks in 21-rider-payment-reservation-repair.md.
--
-- The enum value must commit before this transaction consumes it.
alter type public.delivery_status add value if not exists 'awaiting_customer_payment' after 'searching';

begin;

create table if not exists public.delivery_payment_reservations (
  delivery_id uuid primary key references public.deliveries(id) on delete cascade,
  rider_profile_id uuid not null references public.rider_profiles(id),
  expires_at timestamptz not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'paid', 'expired', 'released', 'late_payment_review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists delivery_payment_reservations_expiry_idx
  on public.delivery_payment_reservations(status, expires_at);
alter table public.delivery_payment_reservations enable row level security;
revoke all on public.delivery_payment_reservations from anon, authenticated;

-- Preserve the existing paid-delivery implementation under an explicit name.
-- The catalog checks make this safe to retry and avoid renaming a repaired
-- wrapper on subsequent runs.
do $$
begin
  if to_regprocedure('public.accept_or_queue_delivery_offer(uuid)') is not null
    and to_regprocedure('public.accept_or_queue_paid_delivery_offer(uuid)') is null then
    execute 'alter function public.accept_or_queue_delivery_offer(uuid) rename to accept_or_queue_paid_delivery_offer';
  end if;
  if to_regprocedure('public.accept_or_queue_paid_delivery_offer(uuid)') is null then
    raise exception 'The existing paid rider acceptance function was not found; stop and restore it before enabling rider-payment reservations';
  end if;
  revoke all on function public.accept_or_queue_paid_delivery_offer(uuid) from public, anon, authenticated;
end;
$$;

create or replace function public.accept_or_queue_delivery_offer(target_delivery_id uuid)
returns table(delivery_id uuid, assignment_status public.delivery_status)
language plpgsql security definer set search_path=public as $$
declare
  accepted record;
  delivery public.deliveries%rowtype;
  rider public.rider_profiles%rowtype;
  controls jsonb := '{}'::jsonb;
  reservation_minutes integer := 5;
  expires timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into delivery from public.deliveries where id=target_delivery_id for update;
  if delivery.id is null then raise exception 'Delivery not found'; end if;

  -- Existing payment-first jobs preserve their original acceptance path.
  if coalesce((delivery.metadata->>'rider_payment_reservation'), 'false') <> 'true' then
    return query select * from public.accept_or_queue_paid_delivery_offer(target_delivery_id);
    return;
  end if;

  select * into rider from public.rider_profiles where user_id=auth.uid() for update;
  if rider.id is null then raise exception 'Rider profile not found'; end if;
  if exists (
    select 1 from public.delivery_payment_reservations reservation
    where reservation.rider_profile_id=rider.id and reservation.status='reserved'
      and reservation.expires_at > now()
  ) then
    raise exception 'Complete or wait for your pending customer payment reservation before accepting another delivery';
  end if;

  select value into controls from public.platform_settings where key='admin_site_controls';
  reservation_minutes := least(15, greatest(1,
    coalesce(nullif(controls #>> '{delivery_policy,payment_reservation_minutes}', '')::integer, 5)
  ));

  select * into accepted from public.accept_or_queue_paid_delivery_offer(target_delivery_id);
  if accepted.assignment_status <> 'accepted'::public.delivery_status then
    raise exception 'Complete your active delivery before reserving an unpaid customer-payment delivery';
  end if;

  expires := now() + make_interval(mins => reservation_minutes);
  update public.deliveries
    set status='awaiting_customer_payment',
      metadata=metadata || jsonb_build_object('payment_reservation_expires_at', expires),
      updated_at=now()
    where id=target_delivery_id;
  insert into public.delivery_payment_reservations(delivery_id, rider_profile_id, expires_at)
    values(target_delivery_id, rider.id, expires)
    on conflict (delivery_id) do update
      set rider_profile_id=excluded.rider_profile_id, expires_at=excluded.expires_at,
        status='reserved', updated_at=now()
      where public.delivery_payment_reservations.status in ('expired', 'released');
  insert into public.delivery_events(delivery_id, actor_id, status, title, body)
    values(target_delivery_id, auth.uid(), 'awaiting_customer_payment',
      'Awaiting customer payment', 'Rider reserved while the customer completes payment.');
  return query select target_delivery_id, 'awaiting_customer_payment'::public.delivery_status;
end;
$$;

revoke all on function public.accept_or_queue_delivery_offer(uuid) from public, anon;
grant execute on function public.accept_or_queue_delivery_offer(uuid) to authenticated;

commit;
