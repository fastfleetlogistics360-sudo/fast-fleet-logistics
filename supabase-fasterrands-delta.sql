-- FastErrands: customer-funded purchase budgets with admin-controlled vendor funding.
-- Run after supabase-schema.sql and supabase-payment-webhook-reconciliation-delta.sql.

begin;

create table if not exists public.fast_errand_orders (
  id uuid primary key default gen_random_uuid(),
  errand_code text not null unique,
  customer_id uuid not null references public.users(id) on delete cascade,
  business_profile_id uuid not null references public.business_profiles(id),
  delivery_id uuid not null unique references public.deliveries(id) on delete cascade,
  vendor_name text not null,
  request_items jsonb not null default '[]'::jsonb,
  purchase_budget_ngn numeric not null check (purchase_budget_ngn >= 500),
  actual_purchase_ngn numeric,
  delivery_fee_ngn numeric not null default 0,
  service_fee_ngn numeric not null default 0,
  customer_total_ngn numeric not null check (customer_total_ngn >= 500),
  vendor_transfer_reference text,
  receipt_url text,
  status text not null default 'awaiting_customer_payment'
    check (status in ('awaiting_customer_payment','funded_waiting_admin','top_up_required','vendor_funded','delivered','cancelled')),
  top_up_required_ngn numeric not null default 0,
  funded_at timestamptz,
  vendor_funded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fast_errand_events (
  id uuid primary key default gen_random_uuid(),
  errand_id uuid not null references public.fast_errand_orders(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  event_type text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fast_errand_orders_admin_queue_idx on public.fast_errand_orders(status, created_at desc);
create index if not exists fast_errand_orders_customer_idx on public.fast_errand_orders(customer_id, created_at desc);

drop trigger if exists fast_errand_orders_set_updated_at on public.fast_errand_orders;
create trigger fast_errand_orders_set_updated_at before update on public.fast_errand_orders for each row execute function public.set_updated_at();

alter table public.fast_errand_orders enable row level security;
alter table public.fast_errand_events enable row level security;

drop policy if exists "Customers and admins read own fast errands" on public.fast_errand_orders;
create policy "Customers and admins read own fast errands" on public.fast_errand_orders for select
  using (customer_id = auth.uid() or public.current_user_role() = 'admin');
drop policy if exists "Customers and admins read own fast errand events" on public.fast_errand_events;
create policy "Customers and admins read own fast errand events" on public.fast_errand_events for select
  using (exists (select 1 from public.fast_errand_orders e where e.id = errand_id and (e.customer_id = auth.uid() or public.current_user_role() = 'admin')));

revoke all on public.fast_errand_orders, public.fast_errand_events from anon, authenticated;
grant select on public.fast_errand_orders, public.fast_errand_events to authenticated;

commit;
