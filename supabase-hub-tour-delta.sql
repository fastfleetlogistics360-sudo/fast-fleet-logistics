-- One-time, versioned Hub orientation for every existing and new account.
-- Run this in Supabase before deploying the Hub tour endpoints.

alter table public.profiles
  add column if not exists hub_tour_version integer not null default 0;
