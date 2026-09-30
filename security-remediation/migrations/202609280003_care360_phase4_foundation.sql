-- Care360 Phase 4 foundation. Apply after 202609280002; do not expose this
-- private evidence metadata directly to browser roles.
begin;

create table if not exists public.support_case_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  message_id uuid references public.support_messages(id) on delete restrict,
  uploader_user_id uuid references public.users(id) on delete set null,
  uploader_type text not null check (uploader_type in ('customer','agent','system')),
  visibility text not null default 'public' check (visibility in ('public','internal')),
  storage_key text not null unique,
  original_filename text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','application/pdf')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  status text not null default 'pending' check (status in ('pending','finalized','failed','removed')),
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  constraint support_case_attachments_finalized_at_check check ((status = 'finalized') = (finalized_at is not null) or status in ('pending', 'failed', 'removed'))
);
create index if not exists support_case_attachments_ticket_created_idx on public.support_case_attachments(ticket_id, created_at desc);
create index if not exists support_case_attachments_message_idx on public.support_case_attachments(message_id) where message_id is not null;
alter table public.support_case_attachments enable row level security;
revoke all on public.support_case_attachments from public;
revoke all on public.support_case_attachments from anon;
revoke all on public.support_case_attachments from authenticated;
grant all on public.support_case_attachments to service_role;

-- A message reference is optional (case evidence can exist independently), but
-- when present it must belong to the same case.  The immutable identity fields
-- prevent a service implementation error from moving private evidence later.
create or replace function public.enforce_support_case_attachment_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.message_id is not null and not exists (
    select 1 from public.support_messages sm where sm.id = new.message_id and sm.ticket_id = new.ticket_id
  ) then
    raise exception 'Support attachment message must belong to its ticket';
  end if;
  if tg_op = 'UPDATE' and (
    new.ticket_id is distinct from old.ticket_id or
    new.message_id is distinct from old.message_id or
    new.storage_key is distinct from old.storage_key or
    new.uploader_user_id is distinct from old.uploader_user_id or
    new.uploader_type is distinct from old.uploader_type or
    new.visibility is distinct from old.visibility or
    new.original_filename is distinct from old.original_filename or
    new.content_type is distinct from old.content_type or
    new.byte_size is distinct from old.byte_size
  ) then
    raise exception 'Support attachment identity fields are immutable';
  end if;
  return new;
end;
$$;
drop trigger if exists support_case_attachments_integrity on public.support_case_attachments;
create trigger support_case_attachments_integrity
before insert or update on public.support_case_attachments
for each row execute function public.enforce_support_case_attachment_integrity();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('support-attachments', 'support-attachments', false, 10485760, array['image/jpeg','image/png','image/webp','application/pdf']::text[])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

alter table public.support_tickets
  add column if not exists lifecycle_closed_at timestamptz,
  add column if not exists first_response_sla_escalated_at timestamptz,
  add column if not exists resolution_sla_escalated_at timestamptz,
  add column if not exists proactive_incident_key text;
create unique index if not exists support_tickets_proactive_incident_key_unique on public.support_tickets(proactive_incident_key) where proactive_incident_key is not null;
create index if not exists support_tickets_lifecycle_scan_idx on public.support_tickets(status, resolved_at) where status = 'resolved';
create index if not exists support_tickets_sla_scan_idx on public.support_tickets(status, sla_first_response_at, sla_resolution_at) where status not in ('resolved','closed');

commit;
