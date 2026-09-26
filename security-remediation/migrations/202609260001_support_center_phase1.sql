-- Support Center Phase 1: preserve existing tickets and add the minimum state
-- needed for authenticated case history, replies, unread cursors and closure.
-- All writes remain server-side; no browser write policy is introduced here.
begin;

create sequence if not exists public.support_case_number_seq;

alter table public.support_tickets
  add column if not exists case_number text,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists customer_last_read_at timestamptz,
  add column if not exists admin_last_read_at timestamptz,
  add column if not exists resolved_at timestamptz,
  add column if not exists closed_at timestamptz;

-- Existing status values remain valid. The two additional states support the
-- Phase 1 conversation loop without changing historical records.
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets
  add constraint support_tickets_status_check
  check (status in ('open', 'triaged', 'in_progress', 'waiting_for_customer', 'waiting_for_internal', 'resolved', 'closed')) not valid;

create or replace function public.assign_support_case_number()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.case_number is null then
    new.case_number := format('FFS-%s-%s', to_char(current_date, 'YYYY'), lpad(nextval('public.support_case_number_seq')::text, 6, '0'));
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_assign_case_number on public.support_tickets;
create trigger support_tickets_assign_case_number
before insert on public.support_tickets
for each row execute function public.assign_support_case_number();

-- Preserve legacy records and make each human-facing reference unique.
update public.support_tickets
set case_number = format('FFS-%s-%s', to_char(created_at at time zone 'Africa/Lagos', 'YYYY'), lpad(nextval('public.support_case_number_seq')::text, 6, '0'))
where case_number is null;

alter table public.support_tickets alter column case_number set not null;
create unique index if not exists support_tickets_case_number_unique on public.support_tickets(case_number);
create index if not exists support_tickets_owner_activity_idx on public.support_tickets(user_id, last_activity_at desc);
create index if not exists support_tickets_status_activity_idx on public.support_tickets(status, last_activity_at desc);
create index if not exists support_messages_ticket_created_idx on public.support_messages(ticket_id, created_at);

-- Owner-safe reads gain only customer-safe case metadata. Browser writes remain revoked.
grant select (case_number, last_activity_at, customer_last_read_at, resolved_at, closed_at) on public.support_tickets to authenticated;

commit;
