-- Phase 2: one Marketplace order can create at most one canonical dispatch.
-- Forward-only. Historical rows remain untouched; the marker is written only
-- by the shared workflow for future ready-for-pickup transitions.
begin;

alter table public.deliveries
  add column if not exists marketplace_order_id uuid references public.orders(id) on delete set null;

create unique index if not exists deliveries_marketplace_order_unique_idx
  on public.deliveries(marketplace_order_id)
  where marketplace_order_id is not null;

commit;
