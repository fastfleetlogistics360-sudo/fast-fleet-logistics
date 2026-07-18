-- Fast Fleets 360: server-side storage quota accounting for F-008.
-- Run this forward-only delta in Supabase before deploying the F-008 code.
-- Do not rerun the complete schema for this change.

begin;

create table if not exists public.storage_quota_usage (
  owner_id uuid not null references public.users(id) on delete cascade,
  quota_scope text not null check (quota_scope in ('profile_media', 'rider_kyc', 'business_kyc', 'rider_delivery_proofs', 'admin_media')),
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key (owner_id, quota_scope)
);

create table if not exists public.storage_quota_reservations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  quota_scope text not null check (quota_scope in ('profile_media', 'rider_kyc', 'business_kyc', 'rider_delivery_proofs', 'admin_media')),
  reserved_bytes bigint not null check (reserved_bytes > 0),
  status text not null default 'reserved' check (status in ('reserved', 'committed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  released_at timestamptz
);

create table if not exists public.storage_quota_objects (
  bucket_id text not null,
  object_path text not null,
  owner_id uuid not null references public.users(id) on delete cascade,
  quota_scope text not null check (quota_scope in ('profile_media', 'rider_kyc', 'business_kyc', 'rider_delivery_proofs', 'admin_media')),
  byte_size bigint not null check (byte_size >= 0),
  created_at timestamptz not null default now(),
  primary key (bucket_id, object_path)
);

create index if not exists storage_quota_reservations_expiry_idx
  on public.storage_quota_reservations(status, expires_at);
create index if not exists storage_quota_objects_owner_scope_idx
  on public.storage_quota_objects(owner_id, quota_scope);

alter table public.storage_quota_usage enable row level security;
alter table public.storage_quota_reservations enable row level security;
alter table public.storage_quota_objects enable row level security;

revoke all on public.storage_quota_usage from anon, authenticated;
revoke all on public.storage_quota_reservations from anon, authenticated;
revoke all on public.storage_quota_objects from anon, authenticated;

-- Backfill only F-004 server-generated paths whose first segment is an owner UUID.
-- Legacy assets without an attributable owner remain unmetered until replaced.
with quota_objects as (
  select
    obj.bucket_id,
    obj.name as object_path,
    case
      when split_part(obj.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then split_part(obj.name, '/', 1)::uuid
      else null
    end as owner_id,
    case obj.bucket_id
      when 'profile-photos' then 'profile_media'
      when 'rider-documents' then 'rider_kyc'
      when 'business-documents' then 'business_kyc'
      when 'delivery-proofs' then 'rider_delivery_proofs'
      when 'hero-images' then 'admin_media'
    end as quota_scope,
    case
      when coalesce(obj.metadata ->> 'size', '') ~ '^[0-9]+$' then (obj.metadata ->> 'size')::bigint
      else 0
    end as byte_size
  from storage.objects obj
  where obj.bucket_id in ('profile-photos', 'rider-documents', 'business-documents', 'delivery-proofs', 'hero-images')
)
insert into public.storage_quota_objects (bucket_id, object_path, owner_id, quota_scope, byte_size)
select bucket_id, object_path, owner_id, quota_scope, byte_size
from quota_objects
where owner_id is not null
  and quota_scope is not null
  and exists (select 1 from public.users where id = quota_objects.owner_id)
on conflict (bucket_id, object_path) do nothing;

insert into public.storage_quota_usage (owner_id, quota_scope, used_bytes, reserved_bytes, updated_at)
select owner_id, quota_scope, sum(byte_size), 0, now()
from public.storage_quota_objects
group by owner_id, quota_scope
on conflict (owner_id, quota_scope) do update
set used_bytes = greatest(public.storage_quota_usage.used_bytes, excluded.used_bytes),
    updated_at = now();

create or replace function public.reserve_storage_quota(
  next_owner_id uuid,
  next_scope text,
  next_quota_bytes bigint,
  next_bytes bigint
)
returns table (reservation_id uuid, allowed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_used bigint;
  current_reserved bigint;
  expired_bytes bigint;
  next_reservation_id uuid;
begin
  if next_owner_id is null or next_scope not in ('profile_media', 'rider_kyc', 'business_kyc', 'rider_delivery_proofs', 'admin_media') or next_bytes <= 0 or next_quota_bytes <= 0 then
    raise exception 'Invalid storage quota reservation input';
  end if;

  insert into public.storage_quota_usage(owner_id, quota_scope)
  values (next_owner_id, next_scope)
  on conflict (owner_id, quota_scope) do nothing;

  select used_bytes, reserved_bytes
  into current_used, current_reserved
  from public.storage_quota_usage
  where owner_id = next_owner_id and quota_scope = next_scope
  for update;

  with expired as (
    delete from public.storage_quota_reservations
    where owner_id = next_owner_id
      and quota_scope = next_scope
      and status = 'reserved'
      and expires_at < now()
    returning reserved_bytes
  )
  select coalesce(sum(reserved_bytes), 0) into expired_bytes from expired;

  if expired_bytes > 0 then
    update public.storage_quota_usage
    set reserved_bytes = greatest(0, reserved_bytes - expired_bytes), updated_at = now()
    where owner_id = next_owner_id and quota_scope = next_scope;
    current_reserved := greatest(0, current_reserved - expired_bytes);
  end if;

  if current_used + current_reserved + next_bytes > next_quota_bytes then
    return query select null::uuid, false;
    return;
  end if;

  insert into public.storage_quota_reservations(owner_id, quota_scope, reserved_bytes, expires_at)
  values (next_owner_id, next_scope, next_bytes, now() + interval '10 minutes')
  returning id into next_reservation_id;

  update public.storage_quota_usage
  set reserved_bytes = reserved_bytes + next_bytes, updated_at = now()
  where owner_id = next_owner_id and quota_scope = next_scope;

  return query select next_reservation_id, true;
end;
$$;

create or replace function public.commit_storage_quota_reservation(
  next_reservation_id uuid,
  next_bucket_id text,
  next_object_path text
)
returns table (committed boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.storage_quota_reservations%rowtype;
  object_inserted boolean := false;
begin
  select * into reservation
  from public.storage_quota_reservations
  where id = next_reservation_id
  for update;

  if reservation.id is null or reservation.status <> 'reserved' or reservation.expires_at < now() or nullif(trim(next_bucket_id), '') is null or nullif(trim(next_object_path), '') is null then
    return query select false;
    return;
  end if;

  perform 1 from public.storage_quota_usage
  where owner_id = reservation.owner_id and quota_scope = reservation.quota_scope
  for update;

  insert into public.storage_quota_objects(bucket_id, object_path, owner_id, quota_scope, byte_size)
  values (next_bucket_id, next_object_path, reservation.owner_id, reservation.quota_scope, reservation.reserved_bytes)
  on conflict (bucket_id, object_path) do nothing
  returning true into object_inserted;

  if not coalesce(object_inserted, false) then
    update public.storage_quota_usage
    set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes), updated_at = now()
    where owner_id = reservation.owner_id and quota_scope = reservation.quota_scope;
    update public.storage_quota_reservations
    set status = 'released', released_at = now()
    where id = reservation.id;
    return query select false;
    return;
  end if;

  update public.storage_quota_usage
  set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes),
      used_bytes = used_bytes + reservation.reserved_bytes,
      updated_at = now()
  where owner_id = reservation.owner_id and quota_scope = reservation.quota_scope;

  update public.storage_quota_reservations
  set status = 'committed', committed_at = now()
  where id = reservation.id;

  return query select true;
end;
$$;

create or replace function public.release_storage_quota_reservation(next_reservation_id uuid)
returns table (released boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  reservation public.storage_quota_reservations%rowtype;
begin
  select * into reservation
  from public.storage_quota_reservations
  where id = next_reservation_id
  for update;

  if reservation.id is null or reservation.status <> 'reserved' then
    return query select false;
    return;
  end if;

  perform 1 from public.storage_quota_usage
  where owner_id = reservation.owner_id and quota_scope = reservation.quota_scope
  for update;

  update public.storage_quota_usage
  set reserved_bytes = greatest(0, reserved_bytes - reservation.reserved_bytes), updated_at = now()
  where owner_id = reservation.owner_id and quota_scope = reservation.quota_scope;
  update public.storage_quota_reservations
  set status = 'released', released_at = now()
  where id = reservation.id;

  return query select true;
end;
$$;

create or replace function public.release_storage_quota_object(
  next_bucket_id text,
  next_object_path text
)
returns table (released boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  quota_object public.storage_quota_objects%rowtype;
begin
  select * into quota_object
  from public.storage_quota_objects
  where bucket_id = next_bucket_id and object_path = next_object_path
  for update;

  if quota_object.bucket_id is null then
    return query select false;
    return;
  end if;

  perform 1 from public.storage_quota_usage
  where owner_id = quota_object.owner_id and quota_scope = quota_object.quota_scope
  for update;

  update public.storage_quota_usage
  set used_bytes = greatest(0, used_bytes - quota_object.byte_size), updated_at = now()
  where owner_id = quota_object.owner_id and quota_scope = quota_object.quota_scope;
  delete from public.storage_quota_objects
  where bucket_id = quota_object.bucket_id and object_path = quota_object.object_path;

  return query select true;
end;
$$;

revoke all on function public.reserve_storage_quota(uuid, text, bigint, bigint) from public;
revoke all on function public.commit_storage_quota_reservation(uuid, text, text) from public;
revoke all on function public.release_storage_quota_reservation(uuid) from public;
revoke all on function public.release_storage_quota_object(text, text) from public;
grant execute on function public.reserve_storage_quota(uuid, text, bigint, bigint) to service_role;
grant execute on function public.commit_storage_quota_reservation(uuid, text, text) to service_role;
grant execute on function public.release_storage_quota_reservation(uuid) to service_role;
grant execute on function public.release_storage_quota_object(text, text) to service_role;

commit;
