-- Run only after investor-dashboard-preflight.sql reports zero orphan delivery asset references.
begin;

do $$
begin
  if exists (
    select 1 from public.deliveries d
    left join public.fleet_assets fa on fa.id = d.fleet_asset_id
    where d.fleet_asset_id is not null and fa.id is null
  ) then
    raise exception 'Cannot add deliveries.fleet_asset_id foreign key while orphaned rows exist';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.deliveries'::regclass
      and conname = 'deliveries_fleet_asset_id_fkey'
  ) then
    alter table public.deliveries
      add constraint deliveries_fleet_asset_id_fkey
      foreign key (fleet_asset_id) references public.fleet_assets(id) on delete set null;
  end if;
end;
$$;

create index if not exists deliveries_fleet_asset_completed_idx
  on public.deliveries(fleet_asset_id, delivered_at desc)
  where fleet_asset_id is not null;

commit;
