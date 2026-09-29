begin;

create table if not exists public.support_case_links (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  order_id uuid references public.orders(id) on delete restrict,
  delivery_id uuid references public.deliveries(id) on delete restrict,
  transaction_id uuid references public.transactions(id) on delete restrict,
  business_profile_id uuid references public.business_profiles(id) on delete restrict,
  rider_profile_id uuid references public.rider_profiles(id) on delete restrict,
  investor_profile_id uuid references public.investor_profiles(id) on delete restrict,
  fleet_asset_id uuid references public.fleet_assets(id) on delete restrict,
  heavy_logistics_request_id uuid references public.heavy_logistics_requests(id) on delete restrict,
  link_role text not null default 'affected' check (link_role in ('primary', 'affected', 'derived')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_case_links_one_target check (num_nonnulls(order_id, delivery_id, transaction_id, business_profile_id, rider_profile_id, investor_profile_id, fleet_asset_id, heavy_logistics_request_id) = 1)
);

alter table public.support_case_links enable row level security;
revoke all on public.support_case_links from public;
revoke all on public.support_case_links from anon;
revoke all on public.support_case_links from authenticated;
grant all on public.support_case_links to service_role;

create unique index if not exists support_case_links_unique_order on public.support_case_links(ticket_id, order_id) where order_id is not null;
create unique index if not exists support_case_links_unique_delivery on public.support_case_links(ticket_id, delivery_id) where delivery_id is not null;
create unique index if not exists support_case_links_unique_transaction on public.support_case_links(ticket_id, transaction_id) where transaction_id is not null;
create unique index if not exists support_case_links_ticket_idx on public.support_case_links(ticket_id);
create index if not exists support_case_links_delivery_idx on public.support_case_links(delivery_id) where delivery_id is not null;

insert into public.support_case_links (ticket_id, delivery_id, link_role)
select id, delivery_id, 'primary' from public.support_tickets where delivery_id is not null
on conflict do nothing;

commit;
