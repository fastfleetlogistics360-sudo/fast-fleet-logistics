-- Shared, restaurant-issued hand-off codes for Vendor Dispatch entries.
-- These are a simple offline comparison aid: the restaurant gives the same
-- code to the customer and assigned cyclist. They are not payment credentials.

alter table public.vendor_dispatch_deliveries
  add column if not exists handoff_code text;

alter table public.vendor_dispatch_deliveries
  drop constraint if exists vendor_dispatch_deliveries_handoff_code_check;
alter table public.vendor_dispatch_deliveries
  add constraint vendor_dispatch_deliveries_handoff_code_check
  check (handoff_code is null or handoff_code ~ '^[0-9]{6}$');

-- Existing records predate the hand-off feature, so intentionally retain a
-- null code rather than invent a code after the delivery was logged.
create or replace function public.vendor_dispatch_add_delivery(
  p_actor_user_id uuid, p_destination text, p_fee_kobo bigint, p_client_submission_id uuid
) returns public.vendor_dispatch_deliveries
language plpgsql security definer set search_path = public as $$
declare
  v_restaurant public.business_profiles%rowtype;
  v_auth public.vendor_dispatch_authorizations%rowtype;
  v_day date := (now() at time zone 'Africa/Lagos')::date;
  v_delivery public.vendor_dispatch_deliveries%rowtype;
  v_handoff_code text;
begin
  select * into v_restaurant from public.business_profiles where user_id = p_actor_user_id;
  if v_restaurant.id is null then raise exception 'Business account required' using errcode = '42501'; end if;
  select * into v_auth from public.vendor_dispatch_authorizations where restaurant_id = v_restaurant.id for update;
  if v_auth.id is null or v_auth.authorization_status <> 'active' or v_auth.assigned_cyclist_id is null then raise exception 'Vendor Dispatch is not authorized for this restaurant' using errcode = '42501'; end if;
  if exists(select 1 from public.vendor_dispatch_daily_settlements where restaurant_id=v_restaurant.id and business_date=v_day) then raise exception 'This business day is closed' using errcode = '23505'; end if;

  -- A restaurant's authorization row is locked above, so new codes cannot
  -- collide within that restaurant while concurrent submissions are handled.
  loop
    v_handoff_code := lpad((floor(random() * 1000000)::integer)::text, 6, '0');
    exit when not exists (
      select 1 from public.vendor_dispatch_deliveries
      where restaurant_id = v_restaurant.id and handoff_code = v_handoff_code
    );
  end loop;

  insert into public.vendor_dispatch_deliveries(restaurant_id, cyclist_id, destination, delivery_fee_kobo, business_date, client_submission_id, handoff_code)
  values(v_restaurant.id, v_auth.assigned_cyclist_id, trim(p_destination), p_fee_kobo, v_day, p_client_submission_id, v_handoff_code)
  on conflict (restaurant_id, client_submission_id) do update set client_submission_id = excluded.client_submission_id
  returning * into v_delivery;
  return v_delivery;
end $$;
