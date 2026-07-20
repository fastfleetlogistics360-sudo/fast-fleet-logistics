-- F-009 Support Ticket And Message Authorization
-- Purpose:
--   Remove every browser write path to support tables, preserve owner-safe reads,
--   require API authorization for administrators, and expose one service-role-only
--   atomic and idempotent ticket creation function.
-- Existing-data impact:
--   Existing tickets/messages are preserved. The nullable idempotency column does not
--   rewrite historical rows. NOT VALID constraints protect new writes without blocking
--   deployment because of legacy content that may need separate review.
-- Anonymous conversations:
--   Anonymous creation remains supported through the server route with Turnstile.
--   Anonymous follow-up is intentionally unsupported, so no ticket access token is added.
-- Deployment:
--   Apply this migration before deploying the matching F-009 application code.
-- Rollback:
--   Keep the owner safe-column grants and API-only admin boundary. Do not restore either
--   `with check (true)` insert policy; server writes require this migration and its RPC.

begin;

alter table if exists public.support_tickets
  add column if not exists idempotency_key uuid;

create unique index if not exists support_tickets_idempotency_key_unique
  on public.support_tickets(idempotency_key);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_topic_length_check' and conrelid = 'public.support_tickets'::regclass) then
    alter table public.support_tickets
      add constraint support_tickets_topic_length_check check (char_length(trim(topic)) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_subject_length_check' and conrelid = 'public.support_tickets'::regclass) then
    alter table public.support_tickets
      add constraint support_tickets_subject_length_check check (subject is null or char_length(subject) <= 180) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_message_length_check' and conrelid = 'public.support_tickets'::regclass) then
    alter table public.support_tickets
      add constraint support_tickets_message_length_check check (char_length(trim(message)) between 6 and 2100) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_messages_body_length_check' and conrelid = 'public.support_messages'::regclass) then
    alter table public.support_messages
      add constraint support_messages_body_length_check check (char_length(trim(body)) between 2 and 2000) not valid;
  end if;
end
$$;

create or replace function public.create_support_ticket_with_messages(
  next_idempotency_key uuid,
  next_user_id uuid,
  next_contact_name text,
  next_contact_email text,
  next_contact_phone text,
  next_topic text,
  next_subject text,
  next_ticket_message text,
  next_priority text,
  next_customer_message text,
  next_bot_message text
)
returns table(ticket_id uuid, created boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_ticket_id uuid;
  existing_ticket_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Support ticket creation is restricted to the server.' using errcode = '42501';
  end if;
  if next_idempotency_key is null then
    raise exception 'Support idempotency key is required.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(next_topic, ''))) not between 1 and 80 then
    raise exception 'Support topic is invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(next_subject, '')) not between 1 and 180 then
    raise exception 'Support subject is invalid.' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(next_ticket_message, ''))) not between 6 and 2100 then
    raise exception 'Support message is invalid.' using errcode = '22023';
  end if;
  if next_priority not in ('normal', 'high', 'urgent') then
    raise exception 'Support priority is invalid.' using errcode = '22023';
  end if;
  if char_length(coalesce(next_contact_name, '')) > 120
    or char_length(coalesce(next_contact_email, '')) > 180
    or char_length(coalesce(next_contact_phone, '')) > 40 then
    raise exception 'Support contact identity is invalid.' using errcode = '22023';
  end if;
  if next_customer_message is not null and char_length(trim(next_customer_message)) not between 6 and 2000 then
    raise exception 'Customer support message is invalid.' using errcode = '22023';
  end if;
  if next_bot_message is not null and char_length(next_bot_message) > 1000 then
    raise exception 'Support automation message is invalid.' using errcode = '22023';
  end if;

  insert into public.support_tickets (
    idempotency_key,
    user_id,
    contact_name,
    contact_email,
    contact_phone,
    topic,
    subject,
    message,
    priority,
    status,
    assigned_admin_id,
    admin_notes
  )
  values (
    next_idempotency_key,
    next_user_id,
    next_contact_name,
    next_contact_email,
    next_contact_phone,
    trim(next_topic),
    next_subject,
    next_ticket_message,
    next_priority,
    'open',
    null,
    null
  )
  on conflict (idempotency_key) do nothing
  returning id into inserted_ticket_id;

  if inserted_ticket_id is null then
    select st.id
      into existing_ticket_id
      from public.support_tickets st
     where st.idempotency_key = next_idempotency_key
       and st.user_id is not distinct from next_user_id
       and st.contact_name is not distinct from next_contact_name
       and st.contact_email is not distinct from next_contact_email
       and st.contact_phone is not distinct from next_contact_phone
       and st.topic = trim(next_topic)
       and st.subject is not distinct from next_subject
       and st.message = next_ticket_message
       and st.priority = next_priority
       and (
         (next_bot_message is null and not exists (
           select 1 from public.support_messages sm where sm.ticket_id = st.id and sm.sender_type = 'bot'
         ))
         or exists (
           select 1 from public.support_messages sm
           where sm.ticket_id = st.id and sm.sender_type = 'bot' and sm.sender_user_id is null and sm.body = next_bot_message
         )
       )
       and (
         (next_customer_message is null and not exists (
           select 1 from public.support_messages sm where sm.ticket_id = st.id and sm.sender_type = 'customer'
         ))
         or exists (
           select 1 from public.support_messages sm
           where sm.ticket_id = st.id
             and sm.sender_type = 'customer'
             and sm.sender_user_id is not distinct from next_user_id
             and sm.body = next_customer_message
         )
       );

    if existing_ticket_id is null then
      raise exception 'Support idempotency key conflict.' using errcode = '23505';
    end if;
    return query select existing_ticket_id, false;
    return;
  end if;

  if next_bot_message is not null then
    insert into public.support_messages (ticket_id, sender_type, sender_user_id, body)
    values (inserted_ticket_id, 'bot', null, next_bot_message);
  end if;

  if next_customer_message is not null then
    insert into public.support_messages (ticket_id, sender_type, sender_user_id, body)
    values (inserted_ticket_id, 'customer', next_user_id, next_customer_message);
  end if;

  return query select inserted_ticket_id, true;
end;
$$;

revoke all on function public.create_support_ticket_with_messages(uuid, uuid, text, text, text, text, text, text, text, text, text) from public;
revoke all on function public.create_support_ticket_with_messages(uuid, uuid, text, text, text, text, text, text, text, text, text) from anon;
revoke all on function public.create_support_ticket_with_messages(uuid, uuid, text, text, text, text, text, text, text, text, text) from authenticated;
grant execute on function public.create_support_ticket_with_messages(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;

-- Anonymous users have no table privileges or RLS policies. Creation is available
-- only through the Turnstile-protected server route and the service-role RPC.
revoke all on public.support_tickets from anon;
revoke all on public.support_messages from anon;

-- Authenticated customers/riders/businesses may read only safe columns on rows
-- they own. Table-wide SELECT is deliberately absent: PostgreSQL RLS filters
-- rows, not columns, so broad SELECT would expose admin_notes, assignment,
-- idempotency keys, and administrator sender identifiers.
revoke all on public.support_tickets from public;
revoke all on public.support_messages from public;
revoke all on public.support_tickets from authenticated;
revoke all on public.support_messages from authenticated;
grant select (
  id, user_id, delivery_id, contact_name, name, contact_email, email,
  contact_phone, phone, topic, tracking_code, subject, message, priority,
  status, created_at, updated_at
) on public.support_tickets to authenticated;
grant select (
  id, ticket_id, sender_type, body, created_at
) on public.support_messages to authenticated;

-- The service role is the only writer and bypasses RLS by design. Application routes
-- must authenticate/authorize before using it.
grant all on public.support_tickets to service_role;
grant all on public.support_messages to service_role;

drop policy if exists "Support ticket owner and admin access" on public.support_tickets;
drop policy if exists "Anyone can create support tickets" on public.support_tickets;
drop policy if exists "Support ticket owners and admins read" on public.support_tickets;
drop policy if exists "Authenticated owners read support tickets" on public.support_tickets;
drop policy if exists "Verified admins read support tickets" on public.support_tickets;

create policy "Authenticated owners read support tickets"
  on public.support_tickets for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Support ticket message owner and admin access" on public.support_messages;
drop policy if exists "Anyone can create support messages" on public.support_messages;
drop policy if exists "Authenticated owners read support messages" on public.support_messages;
drop policy if exists "Verified admins read support messages" on public.support_messages;

create policy "Authenticated owners read support messages"
  on public.support_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.support_tickets st
      where st.id = ticket_id
        and st.user_id = (select auth.uid())
    )
  );

-- Administrators intentionally receive no direct browser policy. Cross-user
-- support access must pass requireAdminSession(), including its current Auth,
-- banned/deleted-user, deleted-profile, and is_admin checks, before the server
-- uses its service-role client.

commit;
