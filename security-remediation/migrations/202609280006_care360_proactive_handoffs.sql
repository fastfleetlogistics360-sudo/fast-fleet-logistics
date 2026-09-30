-- Durable FastConfirm-to-Care360 handoffs. Apply after 202609280005.
begin;

create table if not exists public.support_proactive_handoffs (
  id uuid primary key default gen_random_uuid(),
  incident_key text not null unique,
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  customer_id uuid not null references public.users(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','processing','completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  ticket_id uuid references public.support_tickets(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists support_proactive_handoffs_pending_idx on public.support_proactive_handoffs(status, next_attempt_at) where status <> 'completed';
alter table public.support_proactive_handoffs enable row level security;
revoke all on public.support_proactive_handoffs from public, anon, authenticated;
grant all on public.support_proactive_handoffs to service_role;

create or replace function public.queue_fastconfirm_care360_handoff()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  incident_key text;
  flagged_at text;
begin
  if coalesce(new.metadata -> 'pickup_proof' ->> 'status', '') <> 'rejected'
    or coalesce((new.metadata -> 'pickup_proof' ->> 'can_continue')::boolean, false) is not true
    or new.customer_id is null then return new; end if;
  flagged_at := new.metadata -> 'pickup_proof' ->> 'flagged_at';
  if flagged_at is null or flagged_at !~ '^[0-9TZ:+.-]{20,40}$' then return new; end if;
  incident_key := 'fastconfirm:pickup-proof-dispute:' || new.id::text || ':' || flagged_at;
  insert into public.support_proactive_handoffs (incident_key, delivery_id, customer_id)
    values (incident_key, new.id, new.customer_id)
    on conflict (incident_key) do nothing;
  return new;
end;
$$;
drop trigger if exists deliveries_queue_fastconfirm_care360_handoff on public.deliveries;
create trigger deliveries_queue_fastconfirm_care360_handoff
after update of metadata on public.deliveries
for each row execute function public.queue_fastconfirm_care360_handoff();

create or replace function public.process_support_proactive_handoff(next_handoff_id uuid)
returns table(ticket_id uuid, created boolean, completed boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare handoff public.support_proactive_handoffs%rowtype; proactive record;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Proactive handoff processing is restricted to the server.' using errcode = '42501'; end if;
  update public.support_proactive_handoffs set status = 'processing', locked_at = now(), attempt_count = attempt_count + 1, updated_at = now()
    where id = next_handoff_id and (status = 'pending' and next_attempt_at <= now() or status = 'processing' and locked_at < now() - interval '15 minutes')
    returning * into handoff;
  if not found then
    select * into handoff from public.support_proactive_handoffs where id = next_handoff_id;
    if handoff.status = 'completed' then return query select handoff.ticket_id, false, true; end if;
    return;
  end if;
  begin
    select * into proactive from public.create_proactive_support_case_atomic(handoff.incident_key, handoff.customer_id, handoff.delivery_id, 'A delivery check needs support attention', 'We are reviewing a delivery check and will update you if we need anything else.');
    update public.support_proactive_handoffs set status = 'completed', ticket_id = proactive.ticket_id, completed_at = now(), locked_at = null, updated_at = now() where id = handoff.id;
    return query select proactive.ticket_id, proactive.created, true;
  exception when others then
    update public.support_proactive_handoffs set status = 'pending', locked_at = null, next_attempt_at = now() + interval '5 minutes', updated_at = now() where id = handoff.id;
    return;
  end;
end;
$$;
revoke all on function public.process_support_proactive_handoff(uuid) from public, anon, authenticated;
grant execute on function public.process_support_proactive_handoff(uuid) to service_role;
commit;
