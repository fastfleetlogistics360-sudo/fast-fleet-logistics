-- Fast Fleets 360: delivery PIN confirmation and commission-only launch migration.
-- Run this delta in production instead of rerunning the complete schema.

begin;

alter type public.delivery_status add value if not exists 'awaiting_delivery_confirmation' before 'delivered';

alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders
  add constraint orders_status_check
  check (status in ('pending', 'received', 'preparing', 'packing', 'ready_for_pickup', 'assigned', 'rider_assigned', 'picked_up', 'in_transit', 'awaiting_delivery_confirmation', 'delivered', 'cancelled'));

create table if not exists public.delivery_confirmations (
  id uuid primary key default gen_random_uuid(),
  delivery_id uuid not null unique references public.deliveries(id) on delete cascade,
  code_digest text not null,
  code_ciphertext text not null,
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'locked', 'replaced')),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  send_count integer not null default 1 check (send_count between 1 and 10),
  recipient_phone_last4 text,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  verified_at timestamptz,
  verified_by uuid references public.users(id) on delete set null,
  verification_method text check (verification_method is null or verification_method in ('delivery_pin', 'customer_app', 'admin_override')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists delivery_confirmations_set_updated_at on public.delivery_confirmations;
create trigger delivery_confirmations_set_updated_at
before update on public.delivery_confirmations
for each row execute function public.set_updated_at();

create index if not exists delivery_confirmations_status_expiry_idx on public.delivery_confirmations(status, expires_at);

alter table public.delivery_confirmations enable row level security;
drop policy if exists "Admins manage delivery confirmations" on public.delivery_confirmations;
create policy "Admins manage delivery confirmations"
  on public.delivery_confirmations for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "Delivery updates by assigned rider or admin" on public.deliveries;
drop policy if exists "Admins update deliveries" on public.deliveries;
create policy "Admins update deliveries"
  on public.deliveries for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists "Orders updated by assigned rider or admins" on public.orders;
drop policy if exists "Admins update orders" on public.orders;
create policy "Admins update orders"
  on public.orders for update
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

update public.business_profiles
set commission_rate = case
  when lower(trim(coalesce(nullif(business_type, ''), nullif(industry, ''), ''))) in ('pharmacy', 'med / pharmacy') then 5.00
  else 10.00
end
where commission_rate is distinct from case
  when lower(trim(coalesce(nullif(business_type, ''), nullif(industry, ''), ''))) in ('pharmacy', 'med / pharmacy') then 5.00
  else 10.00
end;

commit;
