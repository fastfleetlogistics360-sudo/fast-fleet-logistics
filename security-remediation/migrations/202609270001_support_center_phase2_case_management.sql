-- Support Center Phase 2: operational case management. Existing cases/messages
-- are preserved; browser write privileges and owner-safe reads remain unchanged.
begin;

alter table public.support_tickets
  add column if not exists persona text not null default 'customer',
  add column if not exists category text,
  add column if not exists subcategory text,
  add column if not exists support_queue text not null default 'customer_care_operations',
  add column if not exists first_responded_at timestamptz,
  add column if not exists sla_first_response_at timestamptz,
  add column if not exists sla_resolution_at timestamptz;

alter table public.support_tickets
  add constraint support_tickets_persona_check check (persona in ('customer', 'rider', 'business', 'investor')) not valid,
  add constraint support_tickets_queue_check check (support_queue in ('customer_care_operations', 'payments_finance', 'rider_fleet_operations', 'business_support', 'safety_risk')) not valid;

alter table public.support_messages
  add column if not exists visibility text not null default 'public',
  add column if not exists message_type text not null default 'message';

alter table public.support_messages
  add constraint support_messages_visibility_check check (visibility in ('public', 'internal')) not valid,
  add constraint support_messages_type_check check (message_type in ('message', 'note', 'system')) not valid;

create table if not exists public.support_case_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_type text not null check (actor_type in ('customer', 'agent', 'system')),
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.support_case_events enable row level security;
revoke all on public.support_case_events from public;
revoke all on public.support_case_events from anon;
revoke all on public.support_case_events from authenticated;
grant all on public.support_case_events to service_role;

create index if not exists support_tickets_queue_activity_idx on public.support_tickets(support_queue, last_activity_at desc);
create index if not exists support_tickets_assignee_activity_idx on public.support_tickets(assigned_admin_id, last_activity_at desc);
create index if not exists support_tickets_category_activity_idx on public.support_tickets(category, last_activity_at desc);
create index if not exists support_tickets_sla_idx on public.support_tickets(sla_first_response_at, sla_resolution_at);
create index if not exists support_case_events_ticket_created_idx on public.support_case_events(ticket_id, created_at);

-- Backfill only safe operational defaults; historical values are not guessed.
update public.support_tickets set persona = 'customer' where persona is null;

commit;
