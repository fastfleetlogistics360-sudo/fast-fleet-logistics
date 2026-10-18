-- Monday Free Breakfast is deliberately isolated from Shopping.  The trusted
-- marketplace_vendors.source_kind is the only classification used below.
begin;

create table if not exists public.marketplace_campaigns (
  id text primary key,
  enabled boolean not null default false,
  timezone text not null default 'Africa/Lagos' check (timezone = 'Africa/Lagos'),
  subsidy_cap_kobo bigint not null default 300000 check (subsidy_cap_kobo >= 0),
  restaurant_order_limit integer not null default 5 check (restaurant_order_limit >= 0),
  customer_order_limit integer check (customer_order_limit is null or customer_order_limit >= 0),
  reservation_minutes integer not null default 15 check (reservation_minutes between 1 and 60),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.marketplace_campaign_restaurants (
  campaign_id text not null references public.marketplace_campaigns(id) on delete cascade,
  marketplace_vendor_id uuid not null references public.marketplace_vendors(id) on delete cascade,
  enabled boolean not null default true,
  order_limit_override integer check (order_limit_override is null or order_limit_override >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (campaign_id, marketplace_vendor_id)
);

create table if not exists public.marketplace_campaign_redemptions (
  id uuid primary key default gen_random_uuid(),
  campaign_id text not null references public.marketplace_campaigns(id) on delete restrict,
  marketplace_vendor_id uuid not null references public.marketplace_vendors(id) on delete restrict,
  customer_id uuid not null references public.users(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  occurrence_date date not null,
  subsidy_kobo bigint not null check (subsidy_kobo >= 0),
  state text not null check (state in ('reserved', 'completed', 'expired', 'released', 'cancelled')),
  expires_at timestamptz,
  completed_at timestamptz,
  idempotency_key text not null unique,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check ((state = 'reserved' and expires_at is not null) or state <> 'reserved')
);
create unique index if not exists marketplace_campaign_redemptions_order_idx
  on public.marketplace_campaign_redemptions(order_id) where order_id is not null;
create index if not exists marketplace_campaign_redemptions_capacity_idx
  on public.marketplace_campaign_redemptions(campaign_id, marketplace_vendor_id, occurrence_date, state);
create index if not exists marketplace_campaign_redemptions_customer_idx
  on public.marketplace_campaign_redemptions(campaign_id, customer_id, occurrence_date, state);

alter table public.marketplace_campaigns enable row level security;
alter table public.marketplace_campaign_restaurants enable row level security;
alter table public.marketplace_campaign_redemptions enable row level security;

insert into public.marketplace_campaigns (id) values ('monday_free_breakfast') on conflict (id) do nothing;
-- Existing registered restaurants are opted in explicitly. Shopping vendors,
-- including groceries which sell food, are structurally excluded.
insert into public.marketplace_campaign_restaurants (campaign_id, marketplace_vendor_id)
select 'monday_free_breakfast', id from public.marketplace_vendors where source_kind = 'restaurant'
on conflict do nothing;

create or replace function public.reserve_monday_free_breakfast(
  target_vendor_id uuid, target_customer_id uuid, target_order_id uuid,
  food_subtotal_kobo bigint, request_key text
) returns jsonb language plpgsql security definer set search_path = public as $$
declare campaign marketplace_campaigns%rowtype; participation marketplace_campaign_restaurants%rowtype;
  local_now timestamp; occurrence date; vendor_cap integer; used_count integer; customer_count integer; subsidy bigint; redemption_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  -- Serialize capacity decisions by campaign/vendor and campaign/customer.
  perform pg_advisory_xact_lock(hashtextextended('monday_free_breakfast:' || target_vendor_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('monday_free_breakfast:customer:' || target_customer_id::text, 0));
  -- clock_timestamp, rather than transaction_timestamp, closes the pre-noon transaction loophole.
  local_now := clock_timestamp() at time zone 'Africa/Lagos'; occurrence := local_now::date;
  select * into campaign from marketplace_campaigns where id = 'monday_free_breakfast' for update;
  if campaign.id is null or not campaign.enabled or extract(isodow from local_now) <> 1 or local_now::time < time '10:00' or local_now::time >= time '12:00' then
    return jsonb_build_object('eligible', false, 'subsidy_kobo', 0);
  end if;
  -- Never infer eligibility from the client marketplace kind, item labels, or a linked business account.
  if not exists (select 1 from marketplace_vendors where id = target_vendor_id and source_kind = 'restaurant' and lifecycle_status = 'active') then
    raise exception 'Restaurant campaign vendor mismatch' using errcode = '22023';
  end if;
  select * into participation from marketplace_campaign_restaurants where campaign_id = campaign.id and marketplace_vendor_id = target_vendor_id and enabled for update;
  if participation.campaign_id is null then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  update marketplace_campaign_redemptions set state = 'expired', updated_at = clock_timestamp()
    where campaign_id = campaign.id and state = 'reserved' and expires_at <= clock_timestamp();
  vendor_cap := coalesce(participation.order_limit_override, campaign.restaurant_order_limit);
  select count(*) into used_count from marketplace_campaign_redemptions where campaign_id = campaign.id and marketplace_vendor_id = target_vendor_id and occurrence_date = occurrence and state in ('reserved','completed');
  select count(*) into customer_count from marketplace_campaign_redemptions where campaign_id = campaign.id and customer_id = target_customer_id and occurrence_date = occurrence and state in ('reserved','completed');
  if used_count >= vendor_cap or (campaign.customer_order_limit is not null and customer_count >= campaign.customer_order_limit) then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  subsidy := least(greatest(food_subtotal_kobo, 0), campaign.subsidy_cap_kobo);
  if subsidy = 0 then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  insert into marketplace_campaign_redemptions (campaign_id, marketplace_vendor_id, customer_id, order_id, occurrence_date, subsidy_kobo, state, expires_at, idempotency_key)
  values (campaign.id, target_vendor_id, target_customer_id, target_order_id, occurrence, subsidy, 'reserved', clock_timestamp() + make_interval(mins => campaign.reservation_minutes), request_key)
  on conflict (idempotency_key) do update set updated_at = clock_timestamp() returning id into redemption_id;
  return jsonb_build_object('eligible', true, 'redemption_id', redemption_id, 'subsidy_kobo', subsidy);
end $$;

-- This is only a non-binding display hint. Final eligibility is always
-- rechecked by reserve_monday_free_breakfast under locks at checkout.
create or replace function public.quote_monday_free_breakfast(
  target_vendor_id uuid, target_customer_id uuid, food_subtotal_kobo bigint
) returns jsonb language plpgsql security definer set search_path = public as $$
declare local_now timestamp; occurrence date; campaign marketplace_campaigns%rowtype; participation marketplace_campaign_restaurants%rowtype;
  vendor_cap integer; used_count integer; customer_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  local_now := clock_timestamp() at time zone 'Africa/Lagos'; occurrence := local_now::date;
  select * into campaign from marketplace_campaigns where id = 'monday_free_breakfast';
  if campaign.id is null or not campaign.enabled or extract(isodow from local_now) <> 1 or local_now::time < time '10:00' or local_now::time >= time '12:00' then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  if not exists (select 1 from marketplace_vendors where id = target_vendor_id and source_kind = 'restaurant' and lifecycle_status = 'active') then raise exception 'Restaurant campaign vendor mismatch' using errcode = '22023'; end if;
  select * into participation from marketplace_campaign_restaurants where campaign_id = campaign.id and marketplace_vendor_id = target_vendor_id and enabled;
  if participation.campaign_id is null then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  vendor_cap := coalesce(participation.order_limit_override, campaign.restaurant_order_limit);
  select count(*) into used_count from marketplace_campaign_redemptions where campaign_id = campaign.id and marketplace_vendor_id = target_vendor_id and occurrence_date = occurrence and (state = 'completed' or (state = 'reserved' and expires_at > clock_timestamp()));
  select count(*) into customer_count from marketplace_campaign_redemptions where campaign_id = campaign.id and customer_id = target_customer_id and occurrence_date = occurrence and (state = 'completed' or (state = 'reserved' and expires_at > clock_timestamp()));
  if used_count >= vendor_cap or (campaign.customer_order_limit is not null and customer_count >= campaign.customer_order_limit) then return jsonb_build_object('eligible', false, 'subsidy_kobo', 0); end if;
  return jsonb_build_object('eligible', true, 'subsidy_kobo', least(greatest(food_subtotal_kobo, 0), campaign.subsidy_cap_kobo));
end $$;

create or replace function public.complete_monday_free_breakfast(target_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  update marketplace_campaign_redemptions set state = 'completed', completed_at = clock_timestamp(), expires_at = null, updated_at = clock_timestamp()
    where order_id = target_order_id and state = 'reserved';
end $$;

create or replace function public.release_monday_free_breakfast(target_order_id uuid, next_state text default 'released')
returns void language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Service role required' using errcode = '42501'; end if;
  if next_state not in ('released', 'cancelled') then raise exception 'Invalid campaign release state' using errcode = '22023'; end if;
  update marketplace_campaign_redemptions set state = next_state, expires_at = null, updated_at = clock_timestamp()
    where order_id = target_order_id and state = 'reserved';
end $$;

revoke all on function public.reserve_monday_free_breakfast(uuid, uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.complete_monday_free_breakfast(uuid) from public, anon, authenticated;
revoke all on function public.release_monday_free_breakfast(uuid, text) from public, anon, authenticated;
revoke all on function public.quote_monday_free_breakfast(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.reserve_monday_free_breakfast(uuid, uuid, uuid, bigint, text) to service_role;
grant execute on function public.complete_monday_free_breakfast(uuid) to service_role;
grant execute on function public.release_monday_free_breakfast(uuid, text) to service_role;
grant execute on function public.quote_monday_free_breakfast(uuid, uuid, bigint) to service_role;
commit;
