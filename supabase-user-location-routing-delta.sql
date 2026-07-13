-- Latest foreground user location support for proximity-based rider matching.

create table if not exists public.user_locations (
  user_id uuid primary key references public.users(id) on delete cascade,
  address text,
  latitude numeric not null,
  longitude numeric not null,
  accuracy numeric,
  source text not null default 'foreground',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.user_locations
  add column if not exists address text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists accuracy numeric,
  add column if not exists source text not null default 'foreground',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

drop trigger if exists user_locations_set_updated_at on public.user_locations;
create trigger user_locations_set_updated_at
before update on public.user_locations
for each row execute function public.set_updated_at();

create index if not exists user_locations_updated_idx on public.user_locations(updated_at desc);

alter table public.user_locations enable row level security;

drop policy if exists "Users manage own latest location and admins manage all" on public.user_locations;

create policy "Users manage own latest location and admins manage all"
  on public.user_locations for all
  using (
    public.current_user_role() = 'admin'
    or user_id = auth.uid()
  )
  with check (
    public.current_user_role() = 'admin'
    or user_id = auth.uid()
  );
